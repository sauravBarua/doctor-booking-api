import type { Prisma } from '../generated/prisma/client';

export const appointmentSelect = {
  id: true,
  doctorId: true,
  patientId: true,
  startAt: true,
  endAt: true,
  status: true,
  reason: true,
  cancelledAt: true,
  cancelledByRole: true,
  cancellationReason: true,
  createdAt: true,
  doctor: {
    select: {
      user: { select: { name: true } },
      specialty: { select: { name: true } },
      clinic: { select: { name: true } },
    },
  },
  patient: { select: { name: true } },
} satisfies Prisma.AppointmentSelect;

export type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;

export function toAppointmentView(row: AppointmentRow) {
  return {
    id: row.id,
    status: row.status,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    reason: row.reason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByRole: row.cancelledByRole,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt.toISOString(),
    doctor: {
      id: row.doctorId,
      name: row.doctor.user.name,
      specialty: row.doctor.specialty.name,
      clinic: row.doctor.clinic.name,
    },
    patient: { id: row.patientId, name: row.patient.name },
  };
}
