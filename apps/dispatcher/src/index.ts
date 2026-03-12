import type { ExecutionContext, ScheduledEvent, Queue } from '@cloudflare/workers-types';
import { transformWooCommerceProduct } from '@pothpancha/shared';

interface Env {
    WEBHOOK_SECRET: string;
    SEARCH_SYNC: Queue;
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
                
                // Strip out heavy, unnecessary WooCommerce fields to stay under 128KB limit
                const lightweightProduct = transformWooCommerceProduct(body);

                // Send to the search-sync-queue
                if (env.SEARCH_SYNC) {
                    await env.SEARCH_SYNC.send({
                        action: topic.replace('product.', ''), // create, update, delete, restore
                        id: objectId,
                        data: lightweightProduct 
                    });
                    console.log(`Queued product ${objectId} to SEARCH_SYNC`);
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
        // Dispatcher logic here
    }
};
