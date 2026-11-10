import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto, NotificationUpdatesDto } from './notifications.dto';

export function toView(row: Notification) {
  return {
    id: row.id,
    seq: row.seq.toString(), // BigInt is not JSON-serializable
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** History, newest first. `nextBefore` is the cursor for the next (older) page. */
  async list(userId: string, query: ListNotificationsDto) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(query.before ? { seq: { lt: BigInt(query.before) } } : {}) },
      orderBy: { seq: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((row) => toView(row)),
      nextBefore: rows.length > query.limit && last ? last.seq.toString() : null,
    };
  }

  /**
   * Polling feed, ascending. Without `after` it only returns the current cursor,
   * so a client starts from "now" and never replays history.
   */
  async updates(userId: string, query: NotificationUpdatesDto) {
    if (query.after === undefined) {
      const latest = await this.prisma.notification.findFirst({
        where: { userId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      return { items: [], cursor: latest ? latest.seq.toString() : '0' };
    }
    const rows = await this.prisma.notification.findMany({
      where: { userId, seq: { gt: BigInt(query.after) } },
      orderBy: { seq: 'asc' },
      take: query.limit,
    });
    const last = rows[rows.length - 1];
    return {
      items: rows.map((row) => toView(row)),
      cursor: last ? last.seq.toString() : query.after,
    };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  /** Idempotent. 404 only when the notification is not the caller's. */
  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count > 0) return;
    const exists = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Notification not found');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
