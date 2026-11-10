import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateMeBase = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  removeImage: z.boolean().optional(),
});

export const updateMeSchema = updateMeBase.refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export class UpdateMeDto extends createZodDto(updateMeBase) {}
