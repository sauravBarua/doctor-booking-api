import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_READ_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  OUTBOX_RETENTION_DAYS,
} from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

@Injectable()
export class CleanupService {
  constructor(private readonly prisma: PrismaService) {}

  async run(now: Date = new Date()) {
    const ago = (days: number) => new Date(now.getTime() - days * DAY);

    // A revoked refresh token must stay until it would have expired anyway: reuse detection needs it.
    const refreshTokens = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: ago(1) } },
    });
    const outboxEvents = await this.prisma.outboxEvent.deleteMany({
      where: { publishedAt: { lt: ago(OUTBOX_RETENTION_DAYS) } },
    });
    const readNotifications = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: ago(NOTIFICATION_READ_RETENTION_DAYS) } },
    });
    const oldNotifications = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: ago(NOTIFICATION_RETENTION_DAYS) } },
    });

    return {
      refreshTokens: refreshTokens.count,
      outboxEvents: outboxEvents.count,
      notifications: readNotifications.count + oldNotifications.count,
    };
  }
}
