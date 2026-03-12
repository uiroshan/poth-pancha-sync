import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Helper to create a signed webhook payload
async function generateSignature(payload: string, secret: string) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

describe('Dispatcher Worker', () => {
    let mockEnv: any;
    let mockCtx: any;

    beforeEach(() => {
        mockEnv = {
            WEBHOOK_SECRET: 'test-secret',
            SEARCH_SYNC: {
                send: vi.fn(),
            },
        };
        mockCtx = {};
    });

    it('should reject non-POST requests', async () => {
        const request = new Request('http://localhost/', { method: 'GET' });
        const response = await worker.fetch(request, mockEnv, mockCtx);
        expect(response.status).toBe(405);
    });

    it('should handle WooCommerce ping requests successfully', async () => {
        const request = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'webhook_id=123',
        });
        const response = await worker.fetch(request, mockEnv, mockCtx);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Webhook Ping OK');
    });

    it('should reject requests missing required headers', async () => {
        const request = new Request('http://localhost/', {
            method: 'POST',
            body: '{"id": 1}',
        });
        const response = await worker.fetch(request, mockEnv, mockCtx);
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing required headers');
    });

    it('should pass validation and queue the payload for product webhooks', async () => {
        const payload = JSON.stringify({
            id: 100,
            name: 'Test Product',
            price: '10.00'
        });
        const signature = await generateSignature(payload, mockEnv.WEBHOOK_SECRET);

        const request = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'X-WC-Webhook-Signature': signature,
                'X-WC-Webhook-Topic': 'product.updated',
                'X-WC-Webhook-Source': 'https://wp.pothpancha.lk/',
            },
            body: payload,
        });

        const response = await worker.fetch(request, mockEnv, mockCtx);
        expect(response.status).toBe(200);

        // Verify the queue was called
        expect(mockEnv.SEARCH_SYNC.send).toHaveBeenCalledTimes(1);
        const queuedData = mockEnv.SEARCH_SYNC.send.mock.calls[0][0];
        expect(queuedData.action).toBe('updated');
        expect(queuedData.id).toBe(100);
        expect(queuedData.data.name).toBe('Test Product');
    });

    it('should reject an invalid signature', async () => {
        const payload = JSON.stringify({ id: 100 });
        const request = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'X-WC-Webhook-Signature': 'invalid-signature-123',
                'X-WC-Webhook-Topic': 'product.updated',
                'X-WC-Webhook-Source': 'https://wp.pothpancha.lk/',
            },
            body: payload,
        });

        const response = await worker.fetch(request, mockEnv, mockCtx);
        expect(response.status).toBe(401);
    });
});
