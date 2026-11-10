import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '../generated/prisma/client';
import type { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from './audit-actions';
import { ListAuditLogsDto } from './audit.dto';

export interface AuditEntry {
  actor: { id: string; role: Role } | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
  ip?: string;
}

type AuditDb = Pick<Prisma.TransactionClient, 'auditLog'>;

function toView(row: AuditLog) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    actor: row.actorId ? { id: row.actorId, role: row.actorRole } : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    ip: row.ip,
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the transaction client so the audit row commits or rolls back with the change. */
  async record(db: AuditDb, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.actor?.id,
        actorRole: entry.actor?.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip,
      },
    });
  }

  async list(query: ListAuditLogsDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((row) => toView(row)),
      nextCursor: rows.length > query.limit && last ? last.id : null,
    };
  }
}
