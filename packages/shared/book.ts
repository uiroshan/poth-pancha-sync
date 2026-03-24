import { z } from 'zod';

export const attributeValueSchema = z.object({
    name: z.string(),
    slug: z.string(),
});

export type AttributeValue = z.infer<typeof attributeValueSchema>;

export const bookImageSchema = z.object({
    src: z.string(),
    alt: z.string().optional(),
});

export type BookImage = z.infer<typeof bookImageSchema>;

export const bookSchema = z.object({
    // Core identifiers
    id: z.number(),
    slug: z.string(),
    name: z.string(),

    // Basic book information
    writer: z.array(attributeValueSchema),
    illustrator: z.array(attributeValueSchema).optional(),
    publisher: attributeValueSchema.optional(),
    language: z.array(attributeValueSchema),
    grade: attributeValueSchema.optional(),

    // Content details
    noOfPages: z.number(),
    short_description: z.string(),
    description: z.string(),

    // Age information
    ageRange: z.string(),
    storyTellingAge: z.array(attributeValueSchema).optional(),
    selfReadingAge: z.array(attributeValueSchema).optional(),

    // Series information
    series: attributeValueSchema.optional(),
    seriesNo: z.string().optional(),

    // Visual representation
    coverImage: z.string(),
    images: z.array(bookImageSchema).optional(),

    // Pricing and inventory
    price: z.number(),
    regularPrice: z.number().optional(),
    onSale: z.boolean().optional(),
    date_on_sale_from: z.string().nullable().optional(),
    date_on_sale_to: z.string().nullable().optional(),
    stock_quantity: z.number().optional(),
    stockStatus: z.string().optional(),

    // Ratings and reviews
    rating: z.number(),
    reviewCount: z.number(),

    // Physical properties
    weight: z.number().optional(),
    dimensions: z.object({
        length: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
    }).optional(),

    // Categorization
    categories: z.array(attributeValueSchema).optional(),
    tags: z.array(attributeValueSchema).optional(),

    // Related products
    relatedIds: z.array(z.number()).optional(),

    sku: z.string().optional(),
    featured: z.boolean().optional(),
    purchasable: z.boolean().optional(),
    totalSales: z.number().optional(),
    permalink: z.string().optional(),
    dateCreated: z.coerce.date().optional(),
    dateModified: z.coerce.date().optional(),

    // Added ISBN field to the Book interface
    isbn: z.string(),

    // Publish status: 'publish', 'draft', 'pending', 'private'
    status: z.string(),
});

export type BookProduct = z.infer<typeof bookSchema>;

const getAttribute = (attributes: any[], name: string): AttributeValue[] => {
    if (!Array.isArray(attributes)) return [];
    const attr = attributes.find((a: any) =>
        a.name === name || a.name?.toLowerCase() === name.toLowerCase()
    );
    if (!attr || !Array.isArray(attr.options)) return [];
    return attr.options.map((opt: string) => ({
        name: opt,
        slug: opt.toLowerCase().replace(/\s+/g, '-')
    }));
};

const getSingleAttribute = (attributes: any[], name: string): AttributeValue | undefined => {
    const values = getAttribute(attributes, name);
    return values.length > 0 ? values[0] : undefined;
};

export function transformWooCommerceBook(body: any): BookProduct {
    const attributes = body.attributes || [];

    const mapTaxonomy = (items: any[]) =>
        Array.isArray(items) ? items.map((c: any) => ({ name: c.name, slug: c.slug })) : [];

    const categories = mapTaxonomy(body.categories);
    const tags = mapTaxonomy(body.tags);

    const rawImages = Array.isArray(body.images) ? body.images : [];

    const mappedImages = rawImages.map((img: any) => ({
        ...img,
        src: img.src?.replace("https://grade1lk.s3.ap-south-1.amazonaws.com", "https://imgs.pothpancha.lk")
            ?.replace("https://wp.pothpancha.lk/wp-content", "https://imgs.pothpancha.lk")
            ?.replace("http://wp.pothpancha.lk/wp-content", "https://imgs.pothpancha.lk"),
    }));

    const images = mappedImages.map((img: any) => ({
        src: img?.src || "/placeholder.svg?height=600&width=400",
        alt: img?.alt || ''
    }));

    const coverImage = images.length > 0 ? images[0].src : "/placeholder.svg?height=600&width=400";

    const seriesNoAttr = attributes.find((a: any) => a.name?.toLowerCase() === 'seriesno');
    const seriesNo = seriesNoAttr?.options?.[0] || undefined;

    const noOfPagesAttr = attributes.find((a: any) =>
        a.name?.toLowerCase() === 'noofpages' || a.name?.toLowerCase() === 'number of pages'
    );
    const noOfPages = noOfPagesAttr ? parseInt(noOfPagesAttr.options?.[0], 10) || 0 : 0;

    const ageRangeAttr = attributes.find((a: any) =>
        a.name?.toLowerCase() === 'agerange' || a.name?.toLowerCase() === 'age range'
    );
    const ageRange = ageRangeAttr?.options?.[0] || '';

    const isbnAttr = attributes.find((a: any) => a.name?.toLowerCase() === 'isbn');
    const isbn = isbnAttr?.options?.[0] || '';

    return bookSchema.parse({
        id: body.id,
        slug: body.slug,
        name: body.name,

        writer: getAttribute(attributes, 'writer'),
        illustrator: getAttribute(attributes, 'illustrator'),
        publisher: getSingleAttribute(attributes, 'publisher'),
        language: getAttribute(attributes, 'language'),
        grade: getSingleAttribute(attributes, 'grade'),

        noOfPages,
        short_description: body.short_description || '',
        description: body.description || '',

        ageRange,
        storyTellingAge: getAttribute(attributes, 'storyTellingAge'),
        selfReadingAge: getAttribute(attributes, 'selfReadingAge'),

        series: getSingleAttribute(attributes, 'series'),
        seriesNo,

        coverImage,
        images,

        price: parseFloat(body.price || '0'),
        regularPrice: parseFloat(body.regular_price || '0') || undefined,
        onSale: body.on_sale,
        date_on_sale_from: body.date_on_sale_from,
        date_on_sale_to: body.date_on_sale_to,
        stock_quantity: body.stock_quantity ?? undefined,
        stockStatus: body.stock_status,

        rating: parseFloat(body.average_rating || '0'),
        reviewCount: parseInt(body.rating_count || '0', 10),

        weight: parseFloat(body.weight || '0') || undefined,
        dimensions: body.dimensions ? {
            length: parseFloat(body.dimensions.length || '0') || undefined,
            width: parseFloat(body.dimensions.width || '0') || undefined,
            height: parseFloat(body.dimensions.height || '0') || undefined,
        } : undefined,

        categories,
        tags,

        relatedIds: body.related_ids,

        sku: body.sku,
        featured: body.featured,
        purchasable: body.purchasable,
        totalSales: body.total_sales,
        permalink: body.permalink,
        dateCreated: body.date_created ? new Date(body.date_created) : undefined,
        dateModified: body.date_modified ? new Date(body.date_modified) : undefined,

        isbn,

        status: body.status || '',
    });
}
