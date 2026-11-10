import { describe, expect, it } from 'vitest';
import { EmailJobHandler } from '../src/jobs/email-job.handler';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { ReminderScanService } from '../src/jobs/reminder-scan.service';
import { parseEmailJob } from '../src/queue/email-job';
import {
  bookAppointment,
  cancelAppointment,
  HOUR,
  insertConfirmed,
  useAsyncFixture,
} from './helpers/async-fixture';

describe('email job handler', () => {
  const s = useAsyncFixture();
  const handler = () => s.ctx.app.get(EmailJobHandler, { strict: false });

  /** Runs the relay with the inline handler detached, so jobs are only captured. */
  async function captureBookingJobs() {
    s.ctx.queue.handler = undefined;
    await bookAppointment(s.ctx, s.f).then(() =>
      s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date()),
    );
    return s.ctx.queue.added.map((j) => j.data);
  }

  it('sends one French email per recipient for a confirmed booking', async () => {
    const jobs = await captureBookingJobs();
    expect(jobs).toHaveLength(2);
    const results = await Promise.all(jobs.map((j) => handler().handle(j, new Date())));
    expect(results).toEqual(['sent', 'sent']);
    expect(s.ctx.mail.sent).toHaveLength(2);
    expect(JSON.stringify(s.ctx.mail.sent)).toContain('Who');
  });

  it('skips a "booked" email when the appointment was cancelled in the meantime', async () => {
    const jobs = await captureBookingJobs();
    const [appointment] = await s.ctx.prisma.appointment.findMany();
    await cancelAppointment(s.ctx, s.f, appointment.id);
    const results = await Promise.all(jobs.map((j) => handler().handle(j, new Date())));
    expect(results).toEqual(['skipped', 'skipped']);
    expect(s.ctx.mail.sent).toHaveLength(0);
  });

  it('skips a reminder when the appointment is no longer confirmed', async () => {
    s.ctx.queue.handler = undefined;
    const id = await insertConfirmed(
      s.ctx,
      s.f,
      new Date(Date.now() + 23 * HOUR + 50 * 60_000),
      new Date(Date.now() - 48 * HOUR),
    );
    await s.ctx.app.get(ReminderScanService, { strict: false }).scan(new Date());
    await s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
    const [job] = s.ctx.queue.added.map((j) => j.data);
    expect(job?.template).toBe('appointment.reminder_24h');
    await s.ctx.prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
    expect(await handler().handle(job, new Date())).toBe('skipped');
    expect(s.ctx.mail.sent).toHaveLength(0);
  });

  it('rejects malformed job payloads', () => {
    expect(() => parseEmailJob({ template: 'nope' })).toThrow();
    expect(() => parseEmailJob(null)).toThrow();
  });
});
