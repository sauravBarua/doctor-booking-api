import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { appointmentSelect, toAppointmentView } from '../appointments/appointment-view';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user'; // ← ADJUST: same path as above
import { AppointmentStatus, Role } from '../generated/prisma/enums';
import { OutboxService } from '../jobs/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminAppointmentsDto } from './admin.dto';

@Injectable()
export class AdminAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAdminAppointmentsDto) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.doctorId ? { doctorId: query.doctorId } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      select: appointmentSelect,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((row) => toAppointmentView(row)),
      nextCursor: rows.length > query.limit && last ? last.id : null,
    };
  }

  /** Only future CONFIRMED appointments; the outbox event notifies both participants. */
  async cancel(actor: AuthUser, id: string, reason: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.appointment.updateMany({
        where: { id, status: AppointmentStatus.CONFIRMED, startAt: { gt: now } },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: now,
          cancelledByRole: Role.ADMIN,
          cancellationReason: reason,
        },
      });
      if (count === 0) {
        const current = await tx.appointment.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!current) throw new NotFoundException('Appointment not found');
        throw new ConflictException(
          current.status === AppointmentStatus.CONFIRMED
            ? 'Appointment already started: mark it completed or no-show instead'
            : `Appointment is already ${current.status}`,
        );
      }
      await this.outbox.record(tx, {
        type: 'appointment.cancelled',
        aggregateId: id,
        payload: { appointmentId: id },
      });
      await this.audit.record(tx, {
        actor: { id: actor.id, role: actor.role },
        action: AUDIT_ACTIONS.APPOINTMENT_CANCELLED_BY_ADMIN,
        entityType: 'appointment',
        entityId: id,
        metadata: { reason },
        ip,
      });
      const row = await tx.appointment.findUniqueOrThrow({
        where: { id },
        select: appointmentSelect,
      });
      return toAppointmentView(row);
    });
  }
}
