import { BadRequestException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { z } from 'zod';

/** Parses the JSON text sent in the multipart `data` field with the endpoint's zod schema. */
export function parseDataField<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  if (typeof raw !== 'string')
    throw new BadRequestException('Field "data" is required (JSON text)');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Field "data" must be valid JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new ZodValidationException(result.error);
  return result.data;
}

/** Multipart (`data` = JSON text) or a plain JSON body. */
export function parsePayload<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof record.data === 'string') return parseDataField(schema, record.data);
  const result = schema.safeParse(record);
  if (!result.success) throw new ZodValidationException(result.error);
  return result.data;
}
