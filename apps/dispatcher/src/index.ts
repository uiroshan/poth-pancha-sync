import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';

interface Env {
    WEBHOOK_SECRET: string;
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

    const binaryString = atob(signatureBase64);
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

        const signature = request.headers.get('X-WC-Webhook-Signature');
        const topic = request.headers.get('X-WC-Webhook-Topic');
        const source = request.headers.get('X-WC-Webhook-Source');

        if (!signature || !topic || !source) {
            return new Response('Missing required headers', { status: 400 });
        }

        if (source !== 'https://wp.pothpancha.lk/') {
            return new Response('Invalid Source', { status: 403 });
        }

        const payload = await request.text();

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
