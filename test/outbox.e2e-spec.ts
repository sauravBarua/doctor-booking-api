import { describe, expect, it } from 'vitest';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { bookAppointment, cancelAppointment, useAsyncFixture } from './helpers/async-fixture';

describe('outbox + relay', () => {
  const s = useAsyncFixture();
  const relay = () => s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
  const templates = () => s.ctx.queue.added.map((j) => j.data.template);

  it('booking writes a pending appointment.booked event in the same transaction', async () => {
    const id = await bookAppointment(s.ctx, s.f);
    const events = await s.ctx.prisma.outboxEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'appointment.booked',
      aggregateId: id,
      publishedAt: null,
    });
  });

  it('relay creates an inbox row + email per participant and marks the event published', async () => {
    await bookAppointment(s.ctx, s.f);
    await relay();
    const rows = await s.ctx.prisma.notification.findMany();
    expect(rows.map((r) => r.userId).sort()).toEqual([s.f.patient.id, s.f.doctor.userId].sort());
    expect(templates()).toEqual(['appointment.booked', 'appointment.booked']);
    expect(s.ctx.mail.sent).toHaveLength(2);
    expect((await s.ctx.prisma.outboxEvent.findFirstOrThrow()).publishedAt).not.toBeNull();
  });

  it('a second relay run does nothing', async () => {
    await bookAppointment(s.ctx, s.f);
    await relay();
    await relay();
    expect(await s.ctx.prisma.notification.count()).toBe(2);
    expect(s.ctx.queue.added).toHaveLength(2);
  });

  it('replaying an already-published event creates no duplicates (at-least-once, idempotent effects)', async () => {
    await bookAppointment(s.ctx, s.f);
    await relay();
    await s.ctx.prisma.outboxEvent.updateMany({ data: { publishedAt: null } });
    await relay();
    expect(await s.ctx.prisma.notification.count()).toBe(2);
    expect(s.ctx.queue.added).toHaveLength(2);
    expect(s.ctx.mail.sent).toHaveLength(2);
  });

  it('cancellation produces its own event and notifies both sides', async () => {
    const id = await bookAppointment(s.ctx, s.f);
    await relay();
    await cancelAppointment(s.ctx, s.f, id);
    await relay();
    expect(await s.ctx.prisma.notification.count()).toBe(4);
    expect(templates().filter((t) => t === 'appointment.cancelled')).toHaveLength(2);
  });

  it('poison events (attempts >= 10) are skipped, not retried forever', async () => {
    await bookAppointment(s.ctx, s.f);
    await s.ctx.prisma.outboxEvent.updateMany({ data: { attempts: 10 } });
    await relay();
    expect((await s.ctx.prisma.outboxEvent.findFirstOrThrow()).publishedAt).toBeNull();
    expect(await s.ctx.prisma.notification.count()).toBe(0);
  });
});
