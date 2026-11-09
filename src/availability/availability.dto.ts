import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { parseHm } from './time-utils';

const hm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:mm (00:00 to 24:00)');

const ruleSchema = z
  .object({ dayOfWeek: z.number().int().min(1).max(7), start: hm, end: hm })
  .refine((rule) => parseHm(rule.start) < parseHm(rule.end), {
    message: 'start must be before end',
    path: ['end'],
  });

const replaceAvailabilitySchema = z.object({ rules: z.array(ruleSchema).max(42) }).refine(
  ({ rules }) => {
    const sorted = [...rules].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || parseHm(a.start) - parseHm(b.start),
    );
    return sorted.every((rule, index) => {
      const previous = sorted[index - 1];
      return (
        !previous ||
        previous.dayOfWeek !== rule.dayOfWeek ||
        parseHm(previous.end) <= parseHm(rule.start)
      );
    });
  },
  { message: 'Rules for the same day must not overlap', path: ['rules'] },
);

const createTimeOffSchema = z
  .object({
    date: z.iso.date(),
    start: hm.optional(),
    end: hm.optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((value) => (value.start === undefined) === (value.end === undefined), {
    message: 'Provide both start and end, or neither',
    path: ['start'],
  })
  .refine(
    (value) =>
      value.start === undefined ||
      value.end === undefined ||
      parseHm(value.start) < parseHm(value.end),
    { message: 'start must be before end', path: ['end'] },
  );

const slotsQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export class ReplaceAvailabilityDto extends createZodDto(replaceAvailabilitySchema) {}
export class CreateTimeOffDto extends createZodDto(createTimeOffSchema) {}
export class SlotsQueryDto extends createZodDto(slotsQuerySchema) {}
