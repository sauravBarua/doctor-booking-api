import { z } from 'zod';
import { APPOINTMENT_TEMPLATES } from '../jobs/appointment-templates';

const otpJob = z.object({
  template: z.literal('otp'),
  to: z.email(),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['register', 'login']),
});

const appointmentJob = z.object({
  template: z.enum(APPOINTMENT_TEMPLATES),
  appointmentId: z.guid(),
  recipientUserId: z.guid(),
  eventId: z.guid(),
});

export const emailJobSchema = z.union([otpJob, appointmentJob]);
export type EmailJobData = z.infer<typeof emailJobSchema>;

/** Job data comes out of Redis: never trust its shape. */
export function parseEmailJob(data: unknown): EmailJobData {
  return emailJobSchema.parse(data);
}
