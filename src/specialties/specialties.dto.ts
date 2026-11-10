import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { slugify } from '../common/utils/slugify';

const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => slugify(value).length > 0, 'Name must contain letters or digits');

export const createSpecialtySchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
});

/** Without the "at least one field" rule: an update may consist of an image only. */
export const updateSpecialtyBase = z.object({
  name: nameSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  removeImage: z.boolean().optional(),
});

export const updateSpecialtySchema = updateSpecialtyBase.refine(
  (value) => Object.keys(value).length > 0,
  {
    message: 'At least one field is required',
  },
);

export class CreateSpecialtyDto extends createZodDto(createSpecialtySchema) {}
export class UpdateSpecialtyDto extends createZodDto(updateSpecialtyBase) {}
