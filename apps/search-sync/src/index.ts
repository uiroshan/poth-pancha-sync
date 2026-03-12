import type { MessageBatch } from '@cloudflare/workers-types';
import type { ProductSyncMessage } from '@pothpancha/shared';

export default {
    async queue(batch: MessageBatch<ProductSyncMessage>, env: any): Promise<void> {
        console.log(`Received batch of ${batch.messages.length} messages in search-sync`);

        for (const message of batch.messages) {
            try {
                const payload = message.body;
                
                console.log(`Processing ${payload.action} for product ID: ${payload.id}`);
                console.log('Product Data:', JSON.stringify(payload.data, null, 2));

                // TODO: Here is where you will send it to Meilisearch
                
                // Acknowledge the message so it's removed from the queue
                message.ack();
            } catch (error) {
                console.error('Error processing message:', error);
                
                // If it fails, we can explicitly retry it
                message.retry();
            }
        }
    }
};
