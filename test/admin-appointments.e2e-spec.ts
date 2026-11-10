import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { ADMIN_EMAIL, createAdmin } from './helpers/admin-fixture';
import { bookAppointment, HOUR, insertConfirmed, useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

interface Page {
  items: { id: string; status: string }[];
  nextCursor: string | null;
}
const REASON = { reason: 'Doctor unavailable' };

describe('admin: appointments', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const admin = () => asUser(ADMIN_EMAIL);
  const relay = () => s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
  const cancel = (id: string) =>
    http().post(`/admin/appointments/${id}/cancel`).set(admin()).send(REASON);

  beforeEach(async () => {
    await createAdmin(s.ctx);
  });

  it('lists every appointment with filters and cursor pagination', async () => {
    const a = await bookAppointment(s.ctx, s.f, 8, 10);
    const b = await bookAppointment(s.ctx, s.f, 8, 11);
    const all = (await http().get('/admin/appointments').set(admin())).body as Page;
    expect(all.items.map((i) => i.id).sort()).toEqual([a, b].sort());

    const none = (await http().get('/admin/appointments?status=CANCELLED').set(admin()))
      .body as Page;
    expect(none.items).toHaveLength(0);
    const byDoctor = (
      await http().get(`/admin/appointments?doctorId=${s.f.doctor.id}`).set(admin())
    ).body as Page;
    expect(byDoctor.items).toHaveLength(2);
    const other = (await http().get(`/admin/appointments?patientId=${randomUUID()}`).set(admin()))
      .body as Page;
    expect(other.items).toHaveLength(0);

    const p1 = (await http().get('/admin/appointments?limit=1').set(admin())).body as Page;
    expect(p1.nextCursor).not.toBeNull();
    const p2 = (
      await http().get(`/admin/appointments?limit=1&cursor=${p1.nextCursor}`).set(admin())
    ).body as Page;
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
  });

  it('cancels as admin: audited, both participants notified through the outbox', async () => {
    const id = await bookAppointment(s.ctx, s.f);
    await relay();
    s.ctx.queue.clear();
    s.ctx.mail.clear();

    const res = await cancel(id).expect(200);
    expect(res.body).toMatchObject({
      id,
      status: 'CANCELLED',
      cancelledByRole: 'ADMIN',
      cancellationReason: 'Doctor unavailable',
    });

    await relay();
    expect(s.ctx.queue.added.map((j) => j.data.template)).toEqual([
      'appointment.cancelled',
      'appointment.cancelled',
    ]);
    expect(s.ctx.mail.sent).toHaveLength(2);

    const logs = await s.ctx.prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'appointment.cancelled_by_admin',
      entityType: 'appointment',
      entityId: id,
    });
  });

  it('rejects non-admins, repeats and unknown ids', async () => {
    const id = await bookAppointment(s.ctx, s.f);
    await http()
      .post(`/admin/appointments/${id}/cancel`)
      .set(asUser(s.f.patient.email))
      .send(REASON)
      .expect(403);
    await cancel(id).expect(200);
    await cancel(id).expect(409);
    await cancel(randomUUID()).expect(404);
  });

  it('refuses to cancel an appointment that already started', async () => {
    const id = await insertConfirmed(
      s.ctx,
      s.f,
      new Date(Date.now() - HOUR),
      new Date(Date.now() - 48 * HOUR),
    );
    await cancel(id).expect(409);
    expect(await s.ctx.prisma.auditLog.count()).toBe(0);
  });

  it('deactivating a doctor reports their upcoming confirmed appointments', async () => {
    await bookAppointment(s.ctx, s.f);
    const res = await http()
      .post(`/admin/users/${s.f.doctor.userId}/deactivate`)
      .set(admin())
      .send({ reason: 'Left the clinic' })
      .expect(200);
    expect(res.body).toMatchObject({ isActive: false, upcomingConfirmedAppointments: 1 });
    const [log] = await s.ctx.prisma.auditLog.findMany();
    expect(log.metadata).toMatchObject({ upcomingConfirmedAppointments: 1, targetRole: 'DOCTOR' });
  });
});
