import type { MessageBatch } from '@cloudflare/workers-types';

interface MediaSyncMessage {
    productId: number;
    action: 'upsert' | 'delete';
    images: Array<{ src: string; alt: string }>;
}

interface Env {}

export default {
    async queue(batch: MessageBatch<MediaSyncMessage>, env: Env): Promise<void> {
        console.log(`Received batch of ${batch.messages.length} messages in media-sync`);

        for (const message of batch.messages) {
            const { productId, action, images } = message.body;
            console.log(`[media-sync] ${action} product ${productId} — ${images.length} images:`);

            for (const image of images) {
                console.log(`  → ${image.src} (alt: "${image.alt}")`);
            }

            message.ack();
        }
    },
};
