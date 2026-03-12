import { describe, it, expect } from 'vitest';
import { transformWooCommerceProduct } from './index';

describe('transformWooCommerceProduct', () => {
    it('should strip out heavy and unnecessary fields from a WooCommerce product payload', () => {
        const mockRawProduct = {
            id: 123,
            name: 'Test Product',
            slug: 'test-product',
            status: 'publish',
            price: '19.99',
            regular_price: '24.99',
            sale_price: '19.99',
            stock_status: 'instock',
            total_sales: 5,
            date_created: '2026-03-12T10:00:00',
            date_modified: '2026-03-12T10:00:00',
            type: 'simple',
            categories: [
                { id: 1, name: 'Category 1', slug: 'category-1', description: 'Heavy description' }
            ],
            images: [
                { id: 10, src: 'https://example.com/img1.jpg', alt: 'Img 1', date_created: '2026', date_modified: '2026' }
            ],
            ignored_heavy_field: 'This should be removed',
            meta_data: [{ id: 1, key: 'heavy_meta', value: 'very heavy' }]
        };

        const result = transformWooCommerceProduct(mockRawProduct);

        // Verify kept fields
        expect(result.id).toBe(123);
        expect(result.name).toBe('Test Product');
        expect(result.slug).toBe('test-product');
        expect(result.status).toBe('publish');
        expect(result.price).toBe('19.99');
        expect(result.regular_price).toBe('24.99');
        expect(result.stock_status).toBe('instock');
        expect(result.total_sales).toBe(5);
        
        // Verify nested stripped fields
        expect(result.categories[0]).toEqual({
            id: 1,
            name: 'Category 1',
            slug: 'category-1'
        });
        expect((result.categories[0] as any).description).toBeUndefined();

        expect(result.images[0]).toEqual({
            id: 10,
            src: 'https://example.com/img1.jpg',
            alt: 'Img 1'
        });
        expect((result.images[0] as any).date_created).toBeUndefined();

        // Verify removed root fields
        expect((result as any).ignored_heavy_field).toBeUndefined();
        expect((result as any).meta_data).toBeUndefined();
    });

    it('should handle products with no categories or images gracefully', () => {
        const mockRawProduct = {
            id: 124,
            name: 'Test Product Empty',
            slug: 'test-product-empty'
        };

        const result = transformWooCommerceProduct(mockRawProduct);

        expect(result.id).toBe(124);
        expect(result.categories).toEqual([]);
        expect(result.images).toEqual([]);
    });
});
