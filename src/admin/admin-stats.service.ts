import { Injectable } from '@nestjs/common';
import { OUTBOX_MAX_ATTEMPTS } from '../common/constants';
import { AppointmentStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(now: Date = new Date()) {
    const roles = Object.values(Role);
    const statuses = Object.values(AppointmentStatus);
    const unpublished = { publishedAt: null };

    const [roleCounts, statusCounts, active, upcoming, pending, failing, stuck, oldest] =
      await Promise.all([
        Promise.all(roles.map((role) => this.prisma.user.count({ where: { role } }))),
        Promise.all(statuses.map((status) => this.prisma.appointment.count({ where: { status } }))),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.appointment.count({
          where: { status: AppointmentStatus.CONFIRMED, startAt: { gt: now } },
        }),
        this.prisma.outboxEvent.count({ where: unpublished }),
        this.prisma.outboxEvent.count({ where: { ...unpublished, attempts: { gt: 0 } } }),
        this.prisma.outboxEvent.count({
          where: { ...unpublished, attempts: { gte: OUTBOX_MAX_ATTEMPTS } },
        }),
        this.prisma.outboxEvent.findFirst({
          where: unpublished,
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

    const total = roleCounts.reduce((sum, n) => sum + n, 0);
    return {
      users: {
        total,
        active,
        inactive: total - active,
        byRole: Object.fromEntries(roles.map((role, i) => [role, roleCounts[i]])),
      },
      appointments: {
        byStatus: Object.fromEntries(statuses.map((status, i) => [status, statusCounts[i]])),
        upcomingConfirmed: upcoming,
      },
      // pending: waiting for the relay. failing: at least one failed attempt.
      // stuck: gave up after OUTBOX_MAX_ATTEMPTS and needs a human.
      outbox: {
        pending,
        failing,
        stuck,
        oldestPendingSeconds: oldest
          ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000)
          : null,
      },
    };
  }
}
