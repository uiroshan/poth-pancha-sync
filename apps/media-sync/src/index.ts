import type { MessageBatch, KVNamespace } from '@cloudflare/workers-types';

const S3_BASE_URL = 'https://grade1lk.s3.ap-south-1.amazonaws.com/';
const BATCH_API_BASE = 'https://batch.imagedelivery.net';

interface Env {
    CF_ACCOUNT_ID: string;
    CF_IMAGES_TOKEN: string;
    MEDIA_STATE: KVNamespace;
}

interface MediaSyncMessage {
    productId: number;
    action: 'upsert' | 'delete';
    images: Array<{ src: string; alt: string }>;
}

interface CfImageRecord {
    cfImageId: string;
    cfUrl: string;
    syncedAt: string;
}

interface BatchToken {
    token: string;
    expiresAt: number; // Unix timestamp
}

/** Derive CF Images custom ID from an S3 URL (the path portion). */
function getImageId(s3Url: string): string {
    return s3Url.replace(S3_BASE_URL, '');
}

/** Safely parse JSON from a response, returning null if it fails. */
async function safeJsonParse(response: Response): Promise<any | null> {
    try {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

/**
 * Obtain a batch token from the CF Images API.
 * Batch tokens bypass the global 1,200 req/5 min limit and allow 200 req/s.
 */
async function getBatchToken(env: Env): Promise<string> {
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/batch_token`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
        }
    );

    const result = await safeJsonParse(response);

    if (!response.ok || !result?.result?.token) {
        const errors = result?.errors ? JSON.stringify(result.errors) : `status ${response.status}`;
        throw new Error(`Failed to get batch token: ${errors}`);
    }

    console.log(`[BATCH_TOKEN] Obtained batch token`);
    return result.result.token;
}

/** Upload an image via the batch API endpoint. */
async function uploadImageByUrl(
    s3Url: string,
    imageId: string,
    batchToken: string,
    env: Env
): Promise<CfImageRecord> {
    const formData = new FormData();
    formData.append('url', s3Url);
    formData.append('id', imageId);

    const startTime = Date.now();
    const response = await fetch(
        `${BATCH_API_BASE}/images/v1`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${batchToken}` },
            body: formData,
        }
    );
    const elapsed = Date.now() - startTime;

    if (response.status === 429) {
        console.error(`[UPLOAD] "${imageId}" RATE LIMITED (429, ${elapsed}ms)`);
        throw new Error(`Rate limited (429) for "${imageId}"`);
    }

    const result = await safeJsonParse(response);

    if (!response.ok) {
        if (response.status === 409) {
            console.log(`[UPLOAD] "${imageId}" ALREADY EXISTS (409, ${elapsed}ms)`);
            return {
                cfImageId: imageId,
                cfUrl: `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
                syncedAt: new Date().toISOString(),
            };
        }
        const errors = result?.errors ? JSON.stringify(result.errors) : `(empty body)`;
        console.error(`[UPLOAD] "${imageId}" FAILED (${response.status}, ${elapsed}ms): ${errors}`);
        throw new Error(`Upload failed [${response.status}]: ${errors}`);
    }

    if (!result) {
        console.error(`[UPLOAD] "${imageId}" EMPTY RESPONSE (${response.status}, ${elapsed}ms)`);
        throw new Error(`Empty response for "${imageId}"`);
    }

    const image = result.result;
    const cfUrl = image.variants?.[0] ?? `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`;
    console.log(`[UPLOAD] "${imageId}" OK (${elapsed}ms) → ${cfUrl}`);

    return {
        cfImageId: image.id,
        cfUrl,
        syncedAt: new Date().toISOString(),
    };
}

/** Delete an image via the batch API endpoint. */
async function deleteImageFromCf(imageId: string, batchToken: string, env: Env): Promise<void> {
    const startTime = Date.now();
    const response = await fetch(
        `${BATCH_API_BASE}/images/v1/${encodeURIComponent(imageId)}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${batchToken}` },
        }
    );
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
        const result = await safeJsonParse(response);
        const errors = result?.errors ? JSON.stringify(result.errors) : `(empty body)`;
        console.error(`[DELETE] "${imageId}" FAILED (${response.status}, ${elapsed}ms): ${errors}`);
        throw new Error(`Delete failed [${response.status}]: ${errors}`);
    }

    console.log(`[DELETE] "${imageId}" OK (${elapsed}ms)`);
}

/** Upsert: check KV → upload to CF → store record in KV. */
async function processUpsertImage(
    image: { src: string; alt: string },
    batchToken: string,
    env: Env
): Promise<'uploaded' | 'skipped_non_s3' | 'skipped_dedup' | 'exists'> {
    if (!image.src.startsWith(S3_BASE_URL)) {
        return 'skipped_non_s3';
    }

    const imageId = getImageId(image.src);
    const kvKey = `img_sync:${imageId}`;

    // Dedup: skip if already synced
    const existing = await env.MEDIA_STATE.get(kvKey, 'json') as CfImageRecord | null;
    if (existing) {
        return 'skipped_dedup';
    }

    const record = await uploadImageByUrl(image.src, imageId, batchToken, env);
    await env.MEDIA_STATE.put(kvKey, JSON.stringify(record));

    return record.cfImageId === imageId ? 'exists' : 'uploaded';
}

/** Delete: remove from CF Images and clear KV record. */
async function processDeleteImage(
    image: { src: string; alt: string },
    batchToken: string,
    env: Env
): Promise<void> {
    if (!image.src.startsWith(S3_BASE_URL)) return;

    const imageId = getImageId(image.src);
    const kvKey = `img_sync:${imageId}`;

    await deleteImageFromCf(imageId, batchToken, env);
    await env.MEDIA_STATE.delete(kvKey);
}

export default {
    async queue(batch: MessageBatch<MediaSyncMessage>, env: Env): Promise<void> {
        const batchStart = Date.now();
        const totalImages = batch.messages.reduce((sum, m) => sum + m.body.images.length, 0);
        console.log(`[BATCH] Processing ${batch.messages.length} messages (${totalImages} total images)`);

        // Obtain a batch token for this entire batch — 200 req/s rate limit
        let batchToken: string;
        try {
            batchToken = await getBatchToken(env);
        } catch (err: any) {
            console.error(`[BATCH] Failed to get batch token: ${err.message} — retrying all messages`);
            for (const message of batch.messages) {
                message.retry();
            }
            return;
        }

        for (const message of batch.messages) {
            const { productId, action, images } = message.body;
            const msgStart = Date.now();

            try {
                let failCount = 0;
                let uploadCount = 0;
                let skipCount = 0;
                let existsCount = 0;

                // Fan-out: process all images in parallel (batch API allows 200 req/s)
                const tasks = images.map(async (image) => {
                    try {
                        if (action === 'delete') {
                            await processDeleteImage(image, batchToken, env);
                            return 'uploaded' as const;
                        }
                        return await processUpsertImage(image, batchToken, env);
                    } catch (err: any) {
                        console.error(`[IMAGE] Product ${productId} FAILED: ${err.message}`);
                        throw err;
                    }
                });

                const results = await Promise.allSettled(tasks);

                for (const result of results) {
                    if (result.status === 'rejected') {
                        failCount++;
                    } else {
                        const outcome = result.value;
                        if (outcome === 'uploaded') uploadCount++;
                        else if (outcome === 'exists') existsCount++;
                        else skipCount++;
                    }
                }

                const elapsed = Date.now() - msgStart;

                if (failCount > 0) {
                    console.error(`[PRODUCT] ${productId} ${action} — ${failCount} failed, ${uploadCount} uploaded, ${existsCount} existed, ${skipCount} skipped (${elapsed}ms) → RETRY`);
                    message.retry();
                } else {
                    console.log(`[PRODUCT] ${productId} ${action} — ${uploadCount} uploaded, ${existsCount} existed, ${skipCount} skipped (${elapsed}ms) → ACK`);
                    message.ack();
                }
            } catch (err: any) {
                console.error(`[PRODUCT] ${productId} UNEXPECTED ERROR: ${err.message} → RETRY`);
                message.retry();
            }
        }

        const batchElapsed = Date.now() - batchStart;
        console.log(`[BATCH] Complete — ${batch.messages.length} messages, ${totalImages} images in ${batchElapsed}ms`);
    },
};
