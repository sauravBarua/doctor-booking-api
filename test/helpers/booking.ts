import { randomUUID } from 'node:crypto';
import type { AppointmentStatus } from '../../src/generated/prisma/enums';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { parisInstant } from './dates';

/** Monday to Friday, 09:00 to 17:00. */
export async function giveWeekdaySchedule(prisma: PrismaService, doctorId: string): Promise<void> {
  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      doctorId,
      dayOfWeek,
      startMinute: 540,
      endMinute: 1020,
    })),
  });
}

export const bookBody = (doctorId: string, date: string, time: string, reason?: string) => ({
  doctorId,
  start: parisInstant(date, time),
  reason,
});

/** Inserts an appointment straight into the database, bypassing every service rule. */
export function insertAppointment(
  prisma: PrismaService,
  o: {
    patientId: string;
    doctorId: string;
    start: Date;
    minutes?: number;
    status?: AppointmentStatus;
    key?: string;
  },
) {
  return prisma.appointment.create({
    data: {
      patientId: o.patientId,
      doctorId: o.doctorId,
      startAt: o.start,
      endAt: new Date(o.start.getTime() + (o.minutes ?? 30) * 60_000),
      status: o.status,
      idempotencyKey: o.key ?? randomUUID(),
    },
  });
}
