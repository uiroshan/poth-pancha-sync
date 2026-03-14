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

/** Fetch an existing image record from CF Images by its custom ID. */
async function fetchExistingCfImage(imageId: string, env: Env): Promise<CfImageRecord> {
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`,
        { headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } }
    );
    const result = await response.json() as any;

    if (!response.ok) {
        console.warn(`Could not fetch existing CF image "${imageId}" [${response.status}], using constructed URL`);
        return {
            cfImageId: imageId,
            cfUrl: `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
            syncedAt: new Date().toISOString(),
        };
    }

    const image = result.result;
    return {
        cfImageId: image.id,
        cfUrl: image.variants?.[0] ?? `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
        syncedAt: new Date().toISOString(),
    };
}

/** Upload an image to CF Images by URL. Uses S3 path as custom ID for dedup. */
async function uploadImageByUrl(s3Url: string, imageId: string, env: Env): Promise<CfImageRecord> {
    const formData = new FormData();
    formData.append('url', s3Url);
    formData.append('id', imageId);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
            body: formData,
        }
    );
    const result = await response.json() as any;

    if (!response.ok) {
        if (response.status === 409) {
            // 409 Conflict = image already exists in CF Images
            console.error(`Image already exists in CF Images: "${imageId}" — fetching real record`, JSON.stringify(result.errors));
            //return fetchExistingCfImage(imageId, env);
            return {
                cfImageId: imageId,
                cfUrl: `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
                syncedAt: new Date().toISOString(),
            };
        }
        throw new Error(`CF Images upload failed [${response.status}]: ${JSON.stringify(result.errors)}`);
    }

    const image = result.result;
    return {
        cfImageId: image.id,
        cfUrl: image.variants?.[0] ?? `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${imageId}/public`,
        syncedAt: new Date().toISOString(),
    };
}

/** Delete an image from CF Images by its custom ID. */
async function deleteImageFromCf(imageId: string, env: Env): Promise<void> {
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
        }
    );
    if (!response.ok) {
        const result = await response.json() as any;
        throw new Error(`CF Images delete failed [${response.status}]: ${JSON.stringify(result.errors)}`);
    }
}

/** Upsert: check KV → upload to CF → store record in KV. */
async function processUpsertImage(
    image: { src: string; alt: string },
    env: Env
): Promise<void> {
    if (!image.src.startsWith(S3_BASE_URL)) {
        console.log(`Skipping non-S3 image: ${image.src}`);
        return;
    }

    const imageId = getImageId(image.src);
    const kvKey = `img_sync:${imageId}`;

    // Dedup: skip if already synced
    const existing = await env.MEDIA_STATE.get(kvKey, 'json') as CfImageRecord | null;
    if (existing) {
        console.log(`Already synced ${kvKey} → ${existing.cfImageId}, skipping`);
        return;
    }

    console.log(`Uploading image: ${image.src} → CF id="${imageId}"`);
    const record = await uploadImageByUrl(image.src, imageId, env);

    await env.MEDIA_STATE.put(kvKey, JSON.stringify(record));
    console.log(`Stored ${kvKey} → ${record.cfUrl}`);
}

/** Delete: remove from CF Images and clear KV record. */
async function processDeleteImage(
    image: { src: string; alt: string },
    env: Env
): Promise<void> {
    if (!image.src.startsWith(S3_BASE_URL)) return;

    const imageId = getImageId(image.src);
    const kvKey = `img_sync:${imageId}`;

    console.log(`Deleting image: CF id="${imageId}"`);
    await deleteImageFromCf(imageId, env);
    await env.MEDIA_STATE.delete(kvKey);
    console.log(`Deleted ${kvKey} from CF Images and KV`);
}

export default {
    async queue(batch: MessageBatch<MediaSyncMessage>, env: Env): Promise<void> {
        for (const message of batch.messages) {
            const { productId, action, images } = message.body;
            console.log(`Processing ${action} for product ${productId} (${images.length} images)`);

            try {
                // Fan-out: process all images in parallel
                const tasks = images.map((image) => {
                    // if (action === 'delete') {
                    //     return processDeleteImage(image, env);
                    // }
                    return processUpsertImage(image, env);
                });

                const results = await Promise.allSettled(tasks);
                const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

                if (failures.length > 0) {
                    console.error(
                        `Product ${productId}: ${failures.length}/${images.length} images failed:`,
                        failures.map(f => f.reason?.message)
                    );
                    message.retry(); // Successful ones will be skipped via KV dedup on retry
                } else {
                    console.log(`Product ${productId}: all ${images.length} images synced`);
                    message.ack();
                }
            } catch (err) {
                console.error(`Unexpected error for product ${productId}:`, err);
                message.retry();
            }
        }
    },
};
