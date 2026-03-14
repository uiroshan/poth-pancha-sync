import type { ExecutionContext, ScheduledEvent, Queue, MessageBatch, KVNamespace } from '@cloudflare/workers-types';
import { transformWooCommerceBook } from '@pothpancha/shared';

interface Env {
    WEBHOOK_SECRET: string;
    SEARCH_SYNC: Queue;
    WOO_FETCH_QUEUE: Queue;
    WOO_URL: string;
    WOO_CONSUMER_KEY: string;
    WOO_CONSUMER_SECRET: string;
    SYNC_STATE: KVNamespace;
}

async function verifyWebhookSignature(
    payload: string,
    signatureBase64: string,
    secret: string
): Promise<boolean> {
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    let binaryString: string;
    try {
        binaryString = atob(signatureBase64);
    } catch (e) {
        return false;
    }

    const signatureBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        signatureBytes[i] = binaryString.charCodeAt(i);
    }

    return await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(payload)
    );
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

        console.log('Received Request:', request.method, request.url, request.headers);

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const payload = await request.text();

        // Handle WooCommerce webhook ping which is sent as x-www-form-urlencoded
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/x-www-form-urlencoded') && payload.includes('webhook_id=')) {
            console.log('Received WooCommerce Webhook Ping:', payload);
            return new Response('Webhook Ping OK', { status: 200 });
        }

        const signature = request.headers.get('X-WC-Webhook-Signature');
        const topic = request.headers.get('X-WC-Webhook-Topic');
        const source = request.headers.get('X-WC-Webhook-Source');

        console.log('Signature:', signature, 'Topic:', topic, 'Source:', source);

        if (!signature || !topic || !source) {
            return new Response('Missing required headers', { status: 400 });
        }

        try {
            const isValid = await verifyWebhookSignature(payload, signature, env.WEBHOOK_SECRET);
            if (!isValid) {
                return new Response('Unauthorized', { status: 401 });
            }

            // Payload is guaranteed to be valid JSON if signature matches, 
            // but catching any parse errors just in case
            const body = JSON.parse(payload);
            const objectId = body.id;

            console.log(`Received Webhook - Topic: ${topic}, Object ID: ${objectId}`);

            // If the webhook is for a product (create, update, delete)
            if (topic.startsWith('product.')) {

                // Extract full book schema parameters from the WooCommerce payload
                const bookProduct = transformWooCommerceBook(body);

                // Send to the search-sync-queue
                if (env.SEARCH_SYNC) {
                    await env.SEARCH_SYNC.send({
                        action: topic.replace('product.', ''), // create, update, delete, restore
                        id: objectId,
                        data: bookProduct
                    });
                    console.log(`Queued book product ${objectId} to SEARCH_SYNC`);
                } else {
                    console.warn('SEARCH_SYNC queue binding is not configured in Env');
                }
            }

            // Graceful Response to prevent the webhook from being disabled
            return new Response('OK', { status: 200 });
        } catch (error) {
            console.error('Error processing webhook:', error);
            // We still return 200 OK so WooCommerce doesn't disable the failing webhook
            return new Response('OK', { status: 200 });
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        if (env.WOO_FETCH_QUEUE) {
            let maxModifiedSeen = '2000-01-01T00:00:00'; // Default fallback date

            if (env.SYNC_STATE) {
                const storedDate = await env.SYNC_STATE.get('max_modified_seen');
                if (storedDate) {
                    maxModifiedSeen = storedDate;
                }
            } else {
                console.warn('SYNC_STATE KV binding is not configured, defaulting to full sync.');
            }

            await env.WOO_FETCH_QUEUE.send({
                action: 'fetch_page',
                page: 1,
                maxModifiedSeen: maxModifiedSeen // Track the maximum date we see during this sync run
            });
            console.log(`Kicked off periodic sync for page 1, fetching products modified after ${maxModifiedSeen}`);
        } else {
            console.error('WOO_FETCH_QUEUE binding is not configured');
        }
    },

    async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
        for (const message of batch.messages) {
            if (message.body.action === 'fetch_page') {
                const currentPage = message.body.page;
                let maxModifiedSeen = message.body.maxModifiedSeen || '2000-01-01T00:00:00';

                console.log(`Processing fetch for page ${currentPage} (modified after ${maxModifiedSeen})`);

                if (!env.WOO_URL || !env.WOO_CONSUMER_KEY || !env.WOO_CONSUMER_SECRET) {
                    console.error('WooCommerce API credentials are not configured in Env');
                    return;
                }

                // 1. Fetch exactly ONE page from WooCommerce
                const perPage = 100;
                const url = new URL(`${env.WOO_URL}/wp-json/wc/v3/products`);
                url.searchParams.append('page', currentPage.toString());
                url.searchParams.append('per_page', perPage.toString());

                // Fetch products modified after the date, in ascending order
                url.searchParams.append('modified_after', maxModifiedSeen + 'Z'); // Woo expects ISO8601 with timezone (Z)
                url.searchParams.append('orderby', 'modified'); // Keep newest modifications at the end
                url.searchParams.append('order', 'asc');

                const authHeader = 'Basic ' + btoa(`${env.WOO_CONSUMER_KEY}:${env.WOO_CONSUMER_SECRET}`);
                const response = await fetch(url.toString(), {
                    headers: {
                        'Authorization': authHeader,
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`WooCommerce API returned ${response.status}: ${await response.text()}`);
                }

                const products = await response.json() as any[];
                console.log(`Fetched ${products.length} products from page ${currentPage}`);

                // 2. Queue these products for down-stream processing
                if (env.SEARCH_SYNC && products.length > 0) {
                    for (const product of products) {
                        // Keep track of the latest 'date_modified_gmt' we've seen in this sync cycle
                        if (product.date_modified_gmt && product.date_modified_gmt > maxModifiedSeen) {
                            maxModifiedSeen = product.date_modified_gmt;
                        }

                        const bookProduct = transformWooCommerceBook(product);
                        await env.SEARCH_SYNC.send({
                            action: 'updated', // Treat periodic syncs as an update action
                            id: product.id,
                            data: bookProduct
                        });
                    }
                }

                // 3. THE MAGIC: If we received 100 products, there is likely a next page.
                if (products.length === perPage && env.WOO_FETCH_QUEUE) {
                    await env.WOO_FETCH_QUEUE.send({
                        action: 'fetch_page',
                        page: 1, // Always fetch page 1 because we are advancing the 'after' date
                        maxModifiedSeen: maxModifiedSeen
                    });
                    console.log(`Queued fetch for next batch starting after ${maxModifiedSeen}`);
                } else if (products.length < perPage) {
                    console.log('Finished full sync! No more pages.');
                }

                // Checkpoint: write the highest modified date we've seen so far back into Cloudflare KV.
                // Doing this per-page ensures we don't start from the beginning if a subsequent page fails.
                if (env.SYNC_STATE) {
                    await env.SYNC_STATE.put('max_modified_seen', maxModifiedSeen);
                    console.log(`Updated max_modified_seen checkpoint in KV to ${maxModifiedSeen}`);
                }
            }
        }
    }
};
