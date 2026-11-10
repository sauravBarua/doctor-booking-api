import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppointmentStatus, Role } from '../generated/prisma/enums';

const limit = z.coerce.number().int().min(1).max(100).default(20);

export class IdParamDto extends createZodDto(z.object({ id: z.guid() })) {}

export class ReasonDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3).max(500) }),
) {}

export class ListUsersDto extends createZodDto(
  z.object({
    limit,
    cursor: z.guid().optional(),
    role: z.enum(Role).optional(),
    isActive: z.stringbool().optional(),
    q: z.string().trim().min(1).max(100).optional(),
  }),
) {}

export class ListAdminAppointmentsDto extends createZodDto(
  z.object({
    limit,
    cursor: z.guid().optional(),
    status: z.enum(AppointmentStatus).optional(),
    doctorId: z.guid().optional(),
    patientId: z.guid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
) {}
