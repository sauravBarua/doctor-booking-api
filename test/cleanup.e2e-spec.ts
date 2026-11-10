import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CleanupService } from '../src/jobs/cleanup.service';
import { HOUR, useAsyncFixture } from './helpers/async-fixture';

const DAY = 24 * HOUR;

describe('cleanup', () => {
  const s = useAsyncFixture();
  const run = () => s.ctx.app.get(CleanupService, { strict: false }).run(new Date());
  const ago = (ms: number) => new Date(Date.now() - ms);

  it('deletes only what is past retention', async () => {
    const userId = s.f.patient.id;
    const token = (expiresAt: Date) =>
      s.ctx.prisma.refreshToken.create({
        data: { userId, familyId: randomUUID(), tokenHash: randomUUID(), expiresAt },
      });
    await token(ago(2 * DAY)); // expired > 1 day: deleted
    await token(ago(HOUR)); // expired recently: kept
    await token(new Date(Date.now() + DAY)); // valid: kept

    const event = (at: Date) =>
      s.ctx.prisma.outboxEvent.create({
        data: { type: 'x', aggregateId: randomUUID(), payload: {}, createdAt: at, publishedAt: at },
      });
    await event(ago(15 * DAY)); // published, past retention: deleted
    await event(ago(DAY)); // recent: kept

    const note = (createdAt: Date, readAt: Date | null) =>
      s.ctx.prisma.notification.create({
        data: {
          userId,
          type: 't',
          title: 't',
          body: 'b',
          dedupeKey: randomUUID(),
          createdAt,
          readAt,
        },
      });
    await note(ago(91 * DAY), ago(91 * DAY)); // read + old: deleted
    await note(ago(91 * DAY), null); // unread + old: kept
    await note(ago(366 * DAY), null); // ancient: deleted
    await note(ago(DAY), ago(DAY)); // read but recent: kept

    expect(await run()).toEqual({ refreshTokens: 1, outboxEvents: 1, notifications: 2 });
    expect(await s.ctx.prisma.refreshToken.count()).toBe(2);
    expect(await s.ctx.prisma.outboxEvent.count()).toBe(1);
    expect(await s.ctx.prisma.notification.count()).toBe(2);
  });

  it('never deletes unpublished outbox events, however old', async () => {
    await s.ctx.prisma.outboxEvent.create({
      data: {
        type: 'x',
        aggregateId: randomUUID(),
        payload: {},
        createdAt: ago(30 * DAY),
        publishedAt: null,
      },
    });
    expect((await run()).outboxEvents).toBe(0);
    expect(await s.ctx.prisma.outboxEvent.count()).toBe(1);
  });
});
