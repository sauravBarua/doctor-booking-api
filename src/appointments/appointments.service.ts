import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AvailabilityService } from '../availability/availability.service';
import { addDays, parisStartOfDay, parisToday } from '../availability/time-utils';
import { MAX_ACTIVE_APPOINTMENTS } from '../common/constants';
import type { AuthUser } from '../common/types/auth-user';
import { isExclusionViolation, isUniqueViolation } from '../common/utils/prisma-errors';
import type { Prisma } from '../generated/prisma/client';
import { AppointmentStatus, Role } from '../generated/prisma/enums';
import { OutboxService } from '../jobs/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { canTransition, patientMayCancel } from './appointment-policy';
import { appointmentSelect, toAppointmentView, type AppointmentRow } from './appointment-view';
import type { BookAppointmentDto, ListAppointmentsDto } from './appointments.dto';

type AppointmentView = ReturnType<typeof toAppointmentView>;
type Db = Pick<Prisma.TransactionClient, 'appointment'>;

function scopeFor(user: AuthUser): Prisma.AppointmentWhereInput {
  switch (user.role) {
    case Role.PATIENT:
      return { patientId: user.id };
    case Role.DOCTOR:
      return { doctor: { userId: user.id } };
    default:
      return {};
  }
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly outbox: OutboxService,
  ) {}

  private findByKey(db: Db, patientId: string, key: string) {
    return db.appointment.findUnique({
      where: { patientId_idempotencyKey: { patientId, idempotencyKey: key } },
      select: appointmentSelect,
    });
  }

  /** The same key must always describe the same request. */
  private replay(row: AppointmentRow, doctorId: string, start: Date): AppointmentView {
    if (row.doctorId !== doctorId || row.startAt.getTime() !== start.getTime()) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request',
      );
    }
    return toAppointmentView(row);
  }

  private async conflictFor(patientId: string, start: Date, end: Date) {
    const clash = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        status: AppointmentStatus.CONFIRMED,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      select: { id: true },
    });
    return new ConflictException(
      clash ? 'You already have an appointment at that time' : 'This slot has just been taken',
    );
  }

  async book(
    patient: AuthUser,
    dto: BookAppointmentDto,
    key: string,
    now: Date = new Date(),
  ): Promise<{ appointment: AppointmentView; replayed: boolean }> {
    const start = new Date(dto.start);

    // 1. A retry returns the original result, even if the slot is no longer offered.
    const existing = await this.findByKey(this.prisma, patient.id, key);
    if (existing)
      return { appointment: this.replay(existing, dto.doctorId, start), replayed: true };

    // 2. Friendly check: the start must be a slot the public endpoint would offer.
    const date = parisToday(start);
    const { slots } = await this.availability.getSlots(dto.doctorId, { from: date, to: date }, now);
    const slot = slots.find((candidate) => candidate.start === start.toISOString());
    if (!slot) throw new ConflictException('This slot is not available');
    const end = new Date(slot.end);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // One patient at a time: makes the limit and idempotent retries race-free.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${patient.id}))`;

          const again = await this.findByKey(tx, patient.id, key);
          if (again) {
            return { appointment: this.replay(again, dto.doctorId, start), replayed: true };
          }

          const active = await tx.appointment.count({
            where: {
              patientId: patient.id,
              status: AppointmentStatus.CONFIRMED,
              startAt: { gt: now },
            },
          });
          if (active >= MAX_ACTIVE_APPOINTMENTS) {
            throw new ConflictException(
              `You already have ${MAX_ACTIVE_APPOINTMENTS} upcoming appointments`,
            );
          }

          // 3. The truth: the exclusion constraints decide if two requests raced.
          const row = await tx.appointment.create({
            data: {
              patientId: patient.id,
              doctorId: dto.doctorId,
              startAt: start,
              endAt: end,
              reason: dto.reason,
              idempotencyKey: key,
            },
            select: appointmentSelect,
          });
          await this.outbox.record(tx, {
            type: 'appointment.booked',
            aggregateId: row.id,
            payload: { appointmentId: row.id, actorRole: patient.role },
          });
          return { appointment: toAppointmentView(row), replayed: false };
        },
        { maxWait: 10_000, timeout: 10_000 },
      );
    } catch (error) {
      if (isExclusionViolation(error)) throw await this.conflictFor(patient.id, start, end);
      if (isUniqueViolation(error)) {
        const duplicate = await this.findByKey(this.prisma, patient.id, key);
        if (duplicate) {
          return { appointment: this.replay(duplicate, dto.doctorId, start), replayed: true };
        }
      }
      throw error;
    }
  }

  private async loadFor(user: AuthUser, id: string): Promise<AppointmentRow> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, ...scopeFor(user) },
      select: appointmentSelect,
    });
    if (!row) throw new NotFoundException('Appointment not found');
    return row;
  }

  async get(user: AuthUser, id: string) {
    return toAppointmentView(await this.loadFor(user, id));
  }

  async list(user: AuthUser, query: ListAppointmentsDto) {
    const where: Prisma.AppointmentWhereInput = {
      ...scopeFor(user),
      status: query.status,
      startAt: {
        gte: query.from ? parisStartOfDay(query.from) : undefined,
        lt: query.to ? parisStartOfDay(addDays(query.to, 1)) : undefined,
      },
    };
    const rows = await this.prisma.appointment.findMany({
      where,
      select: appointmentSelect,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
    });
    const items = rows.slice(0, query.limit);
    return {
      items: items.map((row) => toAppointmentView(row)),
      nextCursor: rows.length > query.limit ? items[items.length - 1].id : null,
    };
  }

  cancel(user: AuthUser, id: string, reason: string | undefined, now: Date = new Date()) {
    return this.transition(user, id, AppointmentStatus.CANCELLED, now, reason);
  }

  complete(user: AuthUser, id: string, now: Date = new Date()) {
    return this.transition(user, id, AppointmentStatus.COMPLETED, now);
  }

  noShow(user: AuthUser, id: string, now: Date = new Date()) {
    return this.transition(user, id, AppointmentStatus.NO_SHOW, now);
  }

  private async transition(
    user: AuthUser,
    id: string,
    target: AppointmentStatus,
    now: Date,
    reason?: string,
  ) {
    const row = await this.loadFor(user, id);

    if (!canTransition(row.status, target)) {
      throw new ConflictException(`The appointment is already ${row.status.toLowerCase()}`);
    }

    if (target === AppointmentStatus.CANCELLED) {
      if (row.startAt <= now) throw new ConflictException('A past appointment cannot be cancelled');
      if (user.role === Role.PATIENT && !patientMayCancel(row.startAt, now)) {
        throw new ConflictException('Patients must cancel at least 24 hours in advance');
      }
    } else if (row.startAt > now) {
      throw new ConflictException('The appointment has not started yet');
    }

    // The status change and its outbox event commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id, status: AppointmentStatus.CONFIRMED },
        data:
          target === AppointmentStatus.CANCELLED
            ? {
                status: target,
                cancelledAt: now,
                cancelledByRole: user.role,
                cancellationReason: reason,
              }
            : { status: target },
      });
      if (count === 0) throw new ConflictException('The appointment has just changed state');

      if (target === AppointmentStatus.CANCELLED) {
        await this.outbox.record(tx, {
          type: 'appointment.cancelled',
          aggregateId: id,
          payload: { appointmentId: id, actorRole: user.role },
        });
      }
    });

    return toAppointmentView(await this.loadFor(user, id));
  }
}
