import type { Prisma } from '../generated/prisma/client';
import type { AppointmentTemplate } from './appointment-templates';

const infoSelect = {
  id: true,
  status: true,
  startAt: true,
  reason: true,
  cancelledByRole: true,
  cancellationReason: true,
  patient: { select: { id: true, name: true, email: true, isActive: true } },
  doctor: {
    select: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
      clinic: { select: { name: true } },
    },
  },
} satisfies Prisma.AppointmentSelect;

export type AppointmentInfo = Prisma.AppointmentGetPayload<{ select: typeof infoSelect }>;
export type RecipientRole = 'patient' | 'doctor';
export interface Recipient {
  userId: string;
  role: RecipientRole;
}

export function loadAppointmentInfo(db: Pick<Prisma.TransactionClient, 'appointment'>, id: string) {
  return db.appointment.findUnique({ where: { id }, select: infoSelect });
}

export function recipientsFor(template: AppointmentTemplate, info: AppointmentInfo): Recipient[] {
  const patient: Recipient = { userId: info.patient.id, role: 'patient' };
  const doctor: Recipient = { userId: info.doctor.user.id, role: 'doctor' };
  switch (template) {
    case 'appointment.booked':
    case 'appointment.cancelled':
      return [patient, doctor];
    default:
      return [patient]; // reminders go to the patient only
  }
}

/** The state check made both when relaying and when sending: is this notice still true? */
export function stillRelevant(
  template: AppointmentTemplate,
  info: AppointmentInfo,
  now: Date,
): boolean {
  switch (template) {
    case 'appointment.cancelled':
      return info.status === 'CANCELLED';
    case 'appointment.booked':
      return info.status === 'CONFIRMED';
    default:
      return info.status === 'CONFIRMED' && info.startAt > now;
  }
}
