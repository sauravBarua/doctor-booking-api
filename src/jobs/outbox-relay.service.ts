import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { OUTBOX_MAX_ATTEMPTS, RELAY_BATCH_SIZE, RELAY_LOCK_KEY } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueue } from '../queue/email-queue';
import { renderAppointment } from './appointment-content';
import { loadAppointmentInfo, recipientsFor, stillRelevant } from './appointment-info';
import { APPOINTMENT_TEMPLATES, type AppointmentTemplate } from './appointment-templates';

const payloadSchema = z.object({ appointmentId: z.guid() });

function isTemplate(type: string): type is AppointmentTemplate {
  return (APPOINTMENT_TEMPLATES as readonly string[]).includes(type);
}

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
  ) {}

  /** Publishes pending events, oldest first. Returns how many were published. */
  async runOnce(limit: number = RELAY_BATCH_SIZE, now: Date = new Date()): Promise<number> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    let published = 0;
    for (const { id } of pending) {
      try {
        if (await this.publish(id, now)) published++;
      } catch (error) {
        await this.recordFailure(id, error);
      }
    }
    return published;
  }

  private publish(eventId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        // One relay at a time, cluster-wide. This also keeps notification `seq` in commit order.
        const lock = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(${RELAY_LOCK_KEY}::bigint) AS locked`;
        if (!lock[0]?.locked) return false;

        const event = await tx.outboxEvent.findUnique({ where: { id: eventId } });
        if (!event || event.publishedAt) return false;
        if (!isTemplate(event.type)) throw new Error(`Unknown event type "${event.type}"`);
        const template = event.type;

        const { appointmentId } = payloadSchema.parse(event.payload);
        const info = await loadAppointmentInfo(tx, appointmentId);

        // State re-check: a booking notice for an appointment cancelled meanwhile is dropped.
        if (info && stillRelevant(template, info, now)) {
          const recipients = recipientsFor(template, info);

          await tx.notification.createMany({
            data: recipients.map((recipient) => {
              const rendered = renderAppointment(template, info, recipient.role);
              return {
                userId: recipient.userId,
                type: template,
                title: rendered.title,
                body: rendered.paragraphs[0],
                data: { appointmentId: info.id },
                dedupeKey: `${event.id}__${recipient.userId}`,
              };
            }),
            skipDuplicates: true,
          });

          for (const recipient of recipients) {
            await this.emailQueue.add({
              jobId: `${event.id}__${template}__${recipient.userId}`,
              data: {
                template,
                appointmentId: info.id,
                recipientUserId: recipient.userId,
                eventId: event.id,
              },
            });
          }
        }

        await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: now } });
        return true;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  private async recordFailure(eventId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Outbox event ${eventId} failed: ${message}`);
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
    });
  }
}
