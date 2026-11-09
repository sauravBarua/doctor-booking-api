import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { slugify } from '../common/utils/slugify';

const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => slugify(value).length > 0, 'Name must contain letters or digits');

const createSpecialtySchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
});

const updateSpecialtySchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export class CreateSpecialtyDto extends createZodDto(createSpecialtySchema) {}
export class UpdateSpecialtyDto extends createZodDto(updateSpecialtySchema) {}
