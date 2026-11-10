import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/types/auth-user'; // ← ADJUST: same path as in appointments.controller.ts
import { ADMIN_LOCK_KEY } from '../common/constants';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import { AppointmentStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './admin.dto';
import { adminUserSelect, toAdminUserView } from './admin-views';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersDto) {
    const rows = await this.prisma.user.findMany({
      where: {
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: 'insensitive' as const } },
                { name: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: adminUserSelect,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((row) => toAdminUserView(row)),
      nextCursor: rows.length > query.limit && last ? last.id : null,
    };
  }

  async get(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: adminUserSelect });
    if (!row) throw new NotFoundException('User not found');
    return toAdminUserView(row);
  }

  async setActive(actor: AuthUser, targetId: string, active: boolean, reason: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize admin status changes, then re-check the actor under the lock: two admins
      // deactivating each other at once must not leave the system without an active admin.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`;
      const me = await tx.user.findUnique({
        where: { id: actor.id },
        select: { isActive: true, role: true },
      });
      if (!me?.isActive || me.role !== Role.ADMIN)
        throw new ForbiddenException('Admin access revoked');

      const target = await tx.user.findUnique({ where: { id: targetId }, select: adminUserSelect });
      if (!target) throw new NotFoundException('User not found');
      if (!active && target.id === actor.id) {
        throw new ConflictException('You cannot deactivate your own account');
      }

      const now = new Date();
      const upcoming = await this.upcomingConfirmed(tx, target.id, now);
      if (target.isActive === active) {
        return { ...toAdminUserView(target), upcomingConfirmedAppointments: upcoming };
      }

      const updated = await tx.user.update({
        where: { id: target.id },
        data: { isActive: active },
        select: adminUserSelect,
      });
      if (!active) {
        await tx.refreshToken.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await this.audit.record(tx, {
        actor: { id: actor.id, role: actor.role },
        action: active ? AUDIT_ACTIONS.USER_REACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
        entityType: 'user',
        entityId: target.id,
        metadata: { reason, targetRole: target.role, upcomingConfirmedAppointments: upcoming },
        ip,
      });
      return { ...toAdminUserView(updated), upcomingConfirmedAppointments: upcoming };
    });
  }

  private upcomingConfirmed(
    db: Pick<Prisma.TransactionClient, 'appointment'>,
    userId: string,
    now: Date,
  ) {
    return db.appointment.count({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startAt: { gt: now },
        OR: [{ patientId: userId }, { doctor: { userId } }],
      },
    });
  }
}
