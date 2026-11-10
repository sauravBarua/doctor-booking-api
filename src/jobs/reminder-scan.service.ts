import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 3_600_000;

const REMINDERS = [
  { type: 'appointment.reminder_24h', offsetMs: 24 * HOUR, graceMs: 2 * HOUR },
  { type: 'appointment.reminder_1h', offsetMs: HOUR, graceMs: 20 * 60_000 },
] as const;

@Injectable()
export class ReminderScanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts one outbox event per appointment and reminder kind. Scanning (rather than delayed
   * jobs) survives restarts and cancellations. The unique dedupe key makes repeated scans safe.
   */
  async scan(now: Date = new Date()): Promise<number> {
    let created = 0;

    for (const reminder of REMINDERS) {
      // Due = startAt - offset <= now, and not stale = due after now - grace.
      const candidates = await this.prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startAt: {
            gt: new Date(now.getTime() + reminder.offsetMs - reminder.graceMs),
            lte: new Date(now.getTime() + reminder.offsetMs),
          },
        },
        select: { id: true, startAt: true, createdAt: true },
      });

      // Only remind appointments that already existed when the reminder came due.
      const due = candidates.filter(
        (appointment) =>
          appointment.createdAt.getTime() <= appointment.startAt.getTime() - reminder.offsetMs,
      );
      if (due.length === 0) continue;

      const result = await this.prisma.outboxEvent.createMany({
        data: due.map((appointment) => ({
          type: reminder.type,
          aggregateId: appointment.id,
          payload: { appointmentId: appointment.id },
          dedupeKey: `${reminder.type}__${appointment.id}`,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  }
}
