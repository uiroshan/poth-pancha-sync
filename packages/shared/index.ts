export interface ProductCategory {
    id: number;
    name: string;
    slug: string;
}

export interface ProductImage {
    id: number;
    src: string;
    alt: string;
}

export interface LightweightProduct {
    id: number;
    name: string;
    slug: string;
    status: string;
    price: string;
    regular_price: string;
    sale_price: string;
    categories: ProductCategory[];
    images: ProductImage[];
    stock_status: string;
    total_sales: number;
    date_created: string;
    date_modified: string;
    type: string;
}

export interface ProductSyncMessage {
    action: string;
    id: number;
    data: LightweightProduct;
}

export function transformWooCommerceProduct(body: any): LightweightProduct {
    return {
        id: body.id,
        name: body.name,
        slug: body.slug,
        status: body.status,
        price: body.price,
        regular_price: body.regular_price,
        sale_price: body.sale_price,
        categories: body.categories?.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })) || [],
        images: body.images?.map((img: any) => ({ id: img.id, src: img.src, alt: img.alt })) || [],
        stock_status: body.stock_status,
        total_sales: body.total_sales,
        date_created: body.date_created,
        date_modified: body.date_modified,
        type: body.type,
    };
}
export interface ImageSyncMessage {
  // Add image sync fields here
}

export interface OrderUpdateMessage {
  // Add order update fields here
}
