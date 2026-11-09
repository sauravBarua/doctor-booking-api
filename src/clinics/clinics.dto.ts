import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const fields = {
  name: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
};

const phoneSchema = z.string().trim().min(5).max(30);

const createClinicSchema = z.object({ ...fields, phone: phoneSchema.optional() });

const updateClinicSchema = z
  .object({
    name: fields.name.optional(),
    addressLine: fields.addressLine.optional(),
    city: fields.city.optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export class CreateClinicDto extends createZodDto(createClinicSchema) {}
export class UpdateClinicDto extends createZodDto(updateClinicSchema) {}
