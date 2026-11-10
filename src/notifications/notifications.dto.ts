import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const cursor = z.string().regex(/^\d{1,18}$/, 'Invalid cursor');

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: cursor.optional(),
});

const updatesSchema = z.object({
  after: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class ListNotificationsDto extends createZodDto(listSchema) {}
export class NotificationUpdatesDto extends createZodDto(updatesSchema) {}
