import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const text = z.string().trim().min(1).max(100);
const dateTime = z.iso.datetime({ offset: true });

export class ListAuditLogsDto extends createZodDto(
  z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.guid().optional(),
      actorId: z.guid().optional(),
      action: text.optional(),
      entityType: text.optional(),
      entityId: text.optional(),
      from: dateTime.optional(),
      to: dateTime.optional(),
    })
    .refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to), {
      message: 'from must not be after to',
      path: ['to'],
    }),
) {}
