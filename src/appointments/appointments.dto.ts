import { BadRequestException } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { uuidSchema } from '../common/schemas/common.schemas';

const STATUSES = ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;

const bookSchema = z.object({
  doctorId: uuidSchema,
  start: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(500).optional(),
});

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });
const idempotencyKeySchema = z.string().min(8).max(100);

export class BookAppointmentDto extends createZodDto(bookSchema) {}
export class ListAppointmentsDto extends createZodDto(listSchema) {}

export function parseCancelBody(body: unknown): { reason?: string } {
  const parsed = cancelSchema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

export function parseIdempotencyKey(header: string | undefined): string {
  const parsed = idempotencyKeySchema.safeParse(header);
  if (!parsed.success) {
    throw new BadRequestException('The Idempotency-Key header is required (8 to 100 characters)');
  }
  return parsed.data;
}
