import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { Role } from '../generated/prisma/enums';
import type { AppointmentTemplate } from './appointment-templates';

type OutboxDb = Pick<Prisma.TransactionClient, 'outboxEvent'>;

@Injectable()
export class OutboxService {
  /** Call inside the transaction that changes the business data, never outside it. */
  record(
    db: OutboxDb,
    input: {
      type: AppointmentTemplate;
      aggregateId: string;
      payload: { appointmentId: string; actorRole?: Role };
      dedupeKey?: string;
    },
  ) {
    return db.outboxEvent.create({
      data: {
        type: input.type,
        aggregateId: input.aggregateId,
        payload: {
          appointmentId: input.payload.appointmentId,
          actorRole: input.payload.actorRole ?? null,
        },
        dedupeKey: input.dedupeKey,
      },
    });
  }
}
