import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const fields = {
  name: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
};

const phoneSchema = z.string().trim().min(5).max(30);

export const createClinicSchema = z.object({ ...fields, phone: phoneSchema.optional() });

/** Without the "at least one field" rule: an update may consist of an image only. */
export const updateClinicBase = z.object({
  name: fields.name.optional(),
  addressLine: fields.addressLine.optional(),
  city: fields.city.optional(),
  phone: phoneSchema.nullable().optional(),
  removeImage: z.boolean().optional(),
});

export const updateClinicSchema = updateClinicBase.refine(
  (value) => Object.keys(value).length > 0,
  {
    message: 'At least one field is required',
  },
);

export class CreateClinicDto extends createZodDto(createClinicSchema) {}
export class UpdateClinicDto extends createZodDto(updateClinicBase) {}
