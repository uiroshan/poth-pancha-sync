import { describe, it, expect, vi } from 'vitest';
import worker from './index';
import type { MessageBatch, Message } from '@cloudflare/workers-types';
import type { ProductSyncMessage } from '@pothpancha/shared';

describe('Search Sync Worker', () => {
    it('should process a batch of messages and ack them', async () => {
        const mockAck1 = vi.fn();
        const mockRetry1 = vi.fn();
        
        const mockAck2 = vi.fn();
        const mockRetry2 = vi.fn();

        const message1: Message<ProductSyncMessage> = {
            id: 'msg-1',
            timestamp: new Date(),
            body: {
                action: 'create',
                id: 1,
                data: {
                    id: 1,
                    name: 'Test 1',
                    slug: 'test-1',
                    status: 'publish',
                    price: '10',
                    regular_price: '10',
                    sale_price: '',
                    categories: [],
                    images: [],
                    stock_status: 'instock',
                    total_sales: 0,
                    date_created: '2026',
                    date_modified: '2026',
                    type: 'simple'
                }
            },
            ack: mockAck1,
            retry: mockRetry1
        };

        const message2: Message<ProductSyncMessage> = {
            id: 'msg-2',
            timestamp: new Date(),
            body: {
                action: 'update',
                id: 2,
                data: {
                    id: 2,
                    name: 'Test 2',
                    slug: 'test-2',
                    status: 'publish',
                    price: '20',
                    regular_price: '20',
                    sale_price: '',
                    categories: [],
                    images: [],
                    stock_status: 'instock',
                    total_sales: 0,
                    date_created: '2026',
                    date_modified: '2026',
                    type: 'simple'
                }
            },
            ack: mockAck2,
            retry: mockRetry2
        };

        const batch: MessageBatch<ProductSyncMessage> = {
            queue: 'search-sync-queue',
            messages: [message1, message2],
            ackAll: vi.fn(),
            retryAll: vi.fn()
        };

        const consoleSpy = vi.spyOn(console, 'log');

        await worker.queue(batch, {});

        // Check if logs were produced
        expect(consoleSpy).toHaveBeenCalledWith('Received batch of 2 messages in search-sync');
        expect(consoleSpy).toHaveBeenCalledWith('Processing create for product ID: 1');
        expect(consoleSpy).toHaveBeenCalledWith('Processing update for product ID: 2');

        // Ensure both messages were acknowledged
        expect(mockAck1).toHaveBeenCalledTimes(1);
        expect(mockAck2).toHaveBeenCalledTimes(1);
        
        // Ensure no messages were retried
        expect(mockRetry1).not.toHaveBeenCalled();
        expect(mockRetry2).not.toHaveBeenCalled();
    });
});
