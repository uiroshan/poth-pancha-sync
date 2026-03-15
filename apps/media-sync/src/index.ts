import type { MessageBatch, KVNamespace } from '@cloudflare/workers-types';

const S3_BASE_URL = 'https://grade1lk.s3.ap-south-1.amazonaws.com/';

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

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch an existing image record from CF Images by its custom ID. */
async function fetchExistingCfImage(imageId: string, env: Env): Promise<CfImageRecord> {
    const startTime = Date.now();
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`,
        { headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } }
    );
    const result = await safeJsonParse(response);
    const elapsed = Date.now() - startTime;

    if (!response.ok || !result) {
        console.warn(`[FETCH_EXISTING] "${imageId}" failed (${response.status}, ${elapsed}ms) — using constructed URL`);
        return {
            cfImageId: imageId,
            cfUrl: `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
            syncedAt: new Date().toISOString(),
        };
    }

    const image = result.result;
    const cfUrl = image.variants?.[0] ?? `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`;
    console.log(`[FETCH_EXISTING] "${imageId}" OK (${elapsed}ms) → ${cfUrl}`);

    return {
        cfImageId: image.id,
        cfUrl,
        syncedAt: new Date().toISOString(),
    };
}

/** Upload an image to CF Images by URL. Uses S3 path as custom ID for dedup. */
async function uploadImageByUrl(s3Url: string, imageId: string, env: Env): Promise<CfImageRecord> {
    const formData = new FormData();
    formData.append('url', s3Url);
    formData.append('id', imageId);

    const startTime = Date.now();
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
            body: formData,
        }
    );
    const elapsed = Date.now() - startTime;

    // Rate limited
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

/** Delete an image from CF Images by its custom ID. */
async function deleteImageFromCf(imageId: string, env: Env): Promise<void> {
    const startTime = Date.now();
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
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

    const record = await uploadImageByUrl(image.src, imageId, env);
    await env.MEDIA_STATE.put(kvKey, JSON.stringify(record));

    return record.cfImageId === imageId ? 'exists' : 'uploaded';
}

/** Delete: remove from CF Images and clear KV record. */
async function processDeleteImage(
    image: { src: string; alt: string },
    env: Env
): Promise<void> {
    if (!image.src.startsWith(S3_BASE_URL)) return;

    const imageId = getImageId(image.src);
    const kvKey = `img_sync:${imageId}`;

    await deleteImageFromCf(imageId, env);
    await env.MEDIA_STATE.delete(kvKey);
}

export default {
    async queue(batch: MessageBatch<MediaSyncMessage>, env: Env): Promise<void> {
        const batchStart = Date.now();
        const totalImages = batch.messages.reduce((sum, m) => sum + m.body.images.length, 0);
        console.log(`[BATCH] Processing ${batch.messages.length} messages (${totalImages} total images)`);

        for (const message of batch.messages) {
            const { productId, action, images } = message.body;
            const msgStart = Date.now();

            try {
                let failCount = 0;
                let uploadCount = 0;
                let skipCount = 0;
                let existsCount = 0;

                // Process images sequentially to avoid hitting rate limits
                for (let i = 0; i < images.length; i++) {
                    try {
                        if (action === 'delete') {
                            await processDeleteImage(images[i], env);
                            uploadCount++;
                        } else {
                            const result = await processUpsertImage(images[i], env);
                            if (result === 'uploaded') uploadCount++;
                            else if (result === 'exists') existsCount++;
                            else skipCount++;
                        }
                        // Small delay between API calls to stay within rate limits
                        if (i < images.length - 1) await sleep(100);
                    } catch (err: any) {
                        console.error(`[IMAGE] Product ${productId} image ${i + 1}/${images.length} FAILED: ${err.message}`);
                        failCount++;
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
