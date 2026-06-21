import { describe, it, expect } from 'vitest';
import { transformWooCommerceBook } from './book';

describe('transformWooCommerceBook', () => {
    it('should extract correct book details from a WooCommerce product payload and map S3 images', () => {
        const mockRawProduct = {
            id: 123,
            name: 'Test Book',
            slug: 'test-book',
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
                { id: 10, src: 'https://grade1lk.s3.ap-south-1.amazonaws.com/img1.jpg', alt: 'Img 1', date_created: '2026', date_modified: '2026' }
            ],
            attributes: [
                { name: 'Writer', options: ['Jane Doe'] },
                { name: 'Language', options: ['English'] },
                { name: 'Pages', options: ['120'] },
                { name: 'AgeRange', options: ['4-8'] },
                { name: 'ISBN', options: ['9781234567890'] }
            ],
            ignored_heavy_field: 'This should be removed',
            meta_data: [{ id: 1, key: 'heavy_meta', value: 'very heavy' }]
        };

        const result = transformWooCommerceBook(mockRawProduct);

        // Verify kept fields
        expect(result.id).toBe(123);
        expect(result.name).toBe('Test Book');
        expect(result.slug).toBe('test-book');
        expect(result.price).toBe(19.99);
        expect(result.regularPrice).toBe(24.99);
        expect(result.stockStatus).toBe('instock');
        expect(result.totalSales).toBe(5);
        expect(result.noOfPages).toBe(120);
        expect(result.ageRange).toBe('4-8');
        expect(result.isbn).toBe('9781234567890');
        
        // Verify nested mapped fields
        expect(result.categories?.[0]).toEqual({
            name: 'Category 1',
            slug: 'category-1'
        });
        expect((result.categories?.[0] as any).description).toBeUndefined();

        // Verify image rewriting
        expect(result.images?.[0]).toEqual({
            src: 'https://imgs.pothpancha.lk/img1.jpg',
            alt: 'Img 1'
        });
        expect(result.coverImage).toBe('https://imgs.pothpancha.lk/img1.jpg');
        expect((result.images?.[0] as any).date_created).toBeUndefined();

        // Verify removed root fields
        expect((result as any).ignored_heavy_field).toBeUndefined();
        expect((result as any).meta_data).toBeUndefined();
    });

    it('should handle books with missing attributes and inject placeholders gracefully', () => {
        const mockRawProduct = {
            id: 124,
            name: 'Test Book Empty',
            slug: 'test-book-empty'
        };

        const result = transformWooCommerceBook(mockRawProduct);

        expect(result.id).toBe(124);
        expect(result.categories).toEqual([]);
        
        // Verify placeholder injection
        expect(result.images).toEqual([]);
        expect(result.coverImage).toBe('/placeholder.svg?height=600&width=400');
        
        expect(result.noOfPages).toBe(0);
        expect(result.ageRange).toBe('');
    });
});
