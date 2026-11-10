import { describe, expect, it } from 'vitest';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { ReminderScanService } from '../src/jobs/reminder-scan.service';
import { HOUR, insertConfirmed, MIN, useAsyncFixture } from './helpers/async-fixture';

describe('reminder scan', () => {
  const s = useAsyncFixture();
  /** The scan only writes outbox events; the relay turns them into notifications and jobs. */
  const scan = async () => {
    await s.ctx.app.get(ReminderScanService, { strict: false }).scan(new Date());
    await s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
  };
  const templates = () => s.ctx.queue.added.map((j) => j.data.template);
  const now = () => Date.now();

  it('sends the 24h reminder once the appointment is inside the window', async () => {
    await insertConfirmed(
      s.ctx,
      s.f,
      new Date(now() + 23 * HOUR + 50 * MIN),
      new Date(now() - 48 * HOUR),
    );
    await scan();
    expect(templates()).toEqual(['appointment.reminder_24h']);
    expect(await s.ctx.prisma.notification.count({ where: { userId: s.f.patient.id } })).toBe(1);
    expect(await s.ctx.prisma.notification.count({ where: { userId: s.f.doctor.userId } })).toBe(0);
  });

  it('is idempotent: scanning again sends nothing new', async () => {
    await insertConfirmed(
      s.ctx,
      s.f,
      new Date(now() + 23 * HOUR + 50 * MIN),
      new Date(now() - 48 * HOUR),
    );
    await scan();
    await scan();
    expect(templates()).toEqual(['appointment.reminder_24h']);
    expect(s.ctx.mail.sent).toHaveLength(1);
  });

  it('does not send a 24h reminder for an appointment booked after that moment', async () => {
    await insertConfirmed(s.ctx, s.f, new Date(now() + 3 * HOUR), new Date());
    await scan();
    expect(templates()).toEqual([]);
  });

  it('does not send a 24h reminder after its 2h grace has expired', async () => {
    await insertConfirmed(s.ctx, s.f, new Date(now() + 20 * HOUR), new Date(now() - 48 * HOUR));
    await scan();
    expect(templates()).toEqual([]);
  });

  it('sends the 1h reminder (and not the stale 24h one)', async () => {
    await insertConfirmed(s.ctx, s.f, new Date(now() + 50 * MIN), new Date(now() - 48 * HOUR));
    await scan();
    expect(templates()).toEqual(['appointment.reminder_1h']);
  });

  it('never reminds for cancelled appointments', async () => {
    const id = await insertConfirmed(
      s.ctx,
      s.f,
      new Date(now() + 23 * HOUR + 50 * MIN),
      new Date(now() - 48 * HOUR),
    );
    await s.ctx.prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
    await scan();
    expect(templates()).toEqual([]);
  });
});
