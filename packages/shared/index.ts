import { z } from 'zod';
import { bookSchema } from './book';

export * from './book';

export const productSyncMessageSchema = z.object({
    action: z.string(),
    id: z.number(),
    data: bookSchema,
});

export type ProductSyncMessage = z.infer<typeof productSyncMessageSchema>;

export interface ImageSyncMessage {
  // Add image sync fields here
}

export interface OrderUpdateMessage {
  // Add order update fields here
}
