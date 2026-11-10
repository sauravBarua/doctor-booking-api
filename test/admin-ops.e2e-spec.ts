import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { ADMIN_EMAIL, createAdmin } from './helpers/admin-fixture';
import { bookAppointment, useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

interface LogPage {
  items: { action: string; entityId: string; actor: { id: string; role: string } | null }[];
  nextCursor: string | null;
}
interface Stats {
  users: { total: number; active: number; inactive: number; byRole: Record<string, number> };
  appointments: { byStatus: Record<string, number>; upcomingConfirmed: number };
  outbox: { pending: number; failing: number; stuck: number; oldestPendingSeconds: number | null };
}

describe('admin: audit log and stats', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const admin = () => asUser(ADMIN_EMAIL);
  let adminId: string;

  beforeEach(async () => {
    adminId = (await createAdmin(s.ctx)).id;
  });

  it('lists audit logs newest first, with filters and cursor', async () => {
    const pat = (await s.ctx.prisma.user.findUniqueOrThrow({ where: { email: 'pat@example.com' } }))
      .id;
    const send = (path: string) =>
      http().post(path).set(admin()).send({ reason: 'test reason' }).expect(200);
    await send(`/admin/users/${pat}/deactivate`);
    await send(`/admin/users/${pat}/reactivate`);
    await send(`/admin/users/${s.f.doctor.userId}/deactivate`);

    const all = (await http().get('/admin/audit-logs').set(admin())).body as LogPage;
    expect(all.items).toHaveLength(3);
    expect(all.items[0]).toMatchObject({ action: 'user.deactivated', entityId: s.f.doctor.userId });
    expect(all.items[0].actor).toEqual({ id: adminId, role: 'ADMIN' });

    const filtered = async (query: string) =>
      ((await http().get(`/admin/audit-logs?${query}`).set(admin())).body as LogPage).items;
    expect(await filtered('action=user.reactivated')).toHaveLength(1);
    expect(await filtered(`entityId=${pat}`)).toHaveLength(2);
    expect(await filtered(`actorId=${adminId}`)).toHaveLength(3);

    const p1 = (await http().get('/admin/audit-logs?limit=2').set(admin())).body as LogPage;
    expect(p1.nextCursor).not.toBeNull();
    const p2 = (await http().get(`/admin/audit-logs?limit=2&cursor=${p1.nextCursor}`).set(admin()))
      .body as LogPage;
    expect(p2.items).toHaveLength(1);
  });

  it('audit logs and stats are admin-only', async () => {
    await http().get('/admin/audit-logs').set(asUser('pat@example.com')).expect(403);
    await http().get('/admin/stats').set(asUser('dr@example.com')).expect(403);
  });

  it('stats summarise users, appointments and the outbox backlog', async () => {
    await bookAppointment(s.ctx, s.f);
    const before = (await http().get('/admin/stats').set(admin())).body as Stats;
    expect(before.users).toMatchObject({
      total: 3,
      active: 3,
      inactive: 0,
      byRole: { PATIENT: 1, DOCTOR: 1, ADMIN: 1 },
    });
    expect(before.appointments.byStatus.CONFIRMED).toBe(1);
    expect(before.appointments.upcomingConfirmed).toBe(1);
    expect(before.outbox).toMatchObject({ pending: 1, failing: 0, stuck: 0 });

    await s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
    const after = (await http().get('/admin/stats').set(admin())).body as Stats;
    expect(after.outbox).toMatchObject({ pending: 0, oldestPendingSeconds: null });
  });
});
