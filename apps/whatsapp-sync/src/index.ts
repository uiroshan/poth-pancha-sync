import type { MessageBatch } from '@cloudflare/workers-types';

interface Env {
    // Add any environment variables here if needed
}

export default {
    async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
        console.log(`Received batch of ${batch.messages.length} messages in whatsapp-sync`);

        for (const message of batch.messages) {
            try {
                const payload = message.body;
                const action = payload.action;
                const orderId = payload.id;

                console.log(`Processing order ${action} for ID: ${orderId}`);
                console.log('Order Data:', JSON.stringify(payload.data, null, 2));

                // Acknowledge the message so it's removed from the queue
                message.ack();
            } catch (error) {
                console.error(`Error processing order message:`, error);
                // If it fails, explicitly retry it
                message.retry();
            }
        }
    }
};
