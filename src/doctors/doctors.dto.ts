import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { emailSchema, paginationSchema, uuidSchema } from '../common/schemas/common.schemas';

const nonEmpty = (value: object) => Object.keys(value).length > 0;
const nonEmptyMessage = { message: 'At least one field is required' };

const bio = z.string().trim().max(2000);
const experienceYears = z.number().int().min(0).max(70);
const slotDurationMin = z.number().int().min(5).max(120);
const doctorName = z.string().trim().min(2).max(100);

const searchDoctorsSchema = paginationSchema.extend({
  specialtyId: uuidSchema.optional(),
  clinicId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

const createDoctorSchema = z.object({
  email: emailSchema,
  name: doctorName,
  specialtyId: uuidSchema,
  clinicId: uuidSchema,
  bio: bio.default(''),
  experienceYears: experienceYears.default(0),
  slotDurationMin: slotDurationMin.default(30),
});

const adminUpdateDoctorSchema = z
  .object({
    name: doctorName.optional(),
    specialtyId: uuidSchema.optional(),
    clinicId: uuidSchema.optional(),
    bio: bio.optional(),
    experienceYears: experienceYears.optional(),
    slotDurationMin: slotDurationMin.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(nonEmpty, nonEmptyMessage);

export const updateMyProfileBase = z.object({
  bio: bio.optional(),
  experienceYears: experienceYears.optional(),
  removeImage: z.boolean().optional(),
});
export const updateMyProfileSchema = updateMyProfileBase.refine(nonEmpty, nonEmptyMessage);

export class SearchDoctorsQueryDto extends createZodDto(searchDoctorsSchema) {}
export class CreateDoctorDto extends createZodDto(createDoctorSchema) {}
export class AdminUpdateDoctorDto extends createZodDto(adminUpdateDoctorSchema) {}
export class UpdateMyProfileDto extends createZodDto(updateMyProfileBase) {}
