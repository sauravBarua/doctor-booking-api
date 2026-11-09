import { z } from 'zod';

export const uuidSchema = z.guid();
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuidSchema.optional(),
});
