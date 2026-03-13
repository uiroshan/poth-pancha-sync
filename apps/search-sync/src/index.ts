import type { MessageBatch } from '@cloudflare/workers-types';
import type { ProductSyncMessage, BookProduct } from '@pothpancha/shared';

interface Env {
    MEILISEARCH_HOST: string;
    MEILISEARCH_API_KEY: string;
    MEILISEARCH_BOOKS_INDEX: string;
}

async function upsertDocument(env: Env, product: BookProduct) {
    const url = `${env.MEILISEARCH_HOST}/indexes/${env.MEILISEARCH_BOOKS_INDEX}/documents`;

    // Meilisearch automatically handles updates/upserts based on the target document's ID
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.MEILISEARCH_API_KEY}`
        },
        body: JSON.stringify([product])
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Meilisearch Upsert Failed: ${response.status} - ${text}`);
    }

    return response.json();
}

async function deleteDocument(env: Env, productId: number) {
    const url = `${env.MEILISEARCH_HOST}/indexes/${env.MEILISEARCH_BOOKS_INDEX}/documents/${productId}`;

    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${env.MEILISEARCH_API_KEY}`
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Meilisearch Delete Failed: ${response.status} - ${text}`);
    }

    return response.json();
}

export default {
    async queue(batch: MessageBatch<ProductSyncMessage>, env: Env): Promise<void> {
        console.log(`Received batch of ${batch.messages.length} messages in search-sync`);

        if (!env.MEILISEARCH_HOST || (!env.MEILISEARCH_API_KEY && env.MEILISEARCH_HOST !== 'http://127.0.0.1:7700')) {
            console.error("Missing critical Meilisearch environment variables.");
            return;
        }

        for (const message of batch.messages) {
            try {
                const payload = message.body;
                const action = payload.action; // 'create', 'update', 'delete', 'restore'

                console.log(`Processing ${action} for product ID: ${payload.id}`);

                if (action === 'create' || action === 'update' || action === 'restore') {
                    await upsertDocument(env, payload.data);
                    console.log(`Successfully upserted product ${payload.id} to Meilisearch`);
                } else if (action === 'delete') {
                    await deleteDocument(env, payload.id);
                    console.log(`Successfully deleted product ${payload.id} from Meilisearch`);
                } else {
                    console.warn(`Unrecognized action: ${action} for product ${payload.id}. Skipping.`);
                }

                // Acknowledge the message so it's removed from the queue
                message.ack();
            } catch (error) {
                console.error(`Error processing message for product ${message.body?.id}:`, error);

                // If it fails, explicitly retry it
                message.retry();
            }
        }
    }
};
