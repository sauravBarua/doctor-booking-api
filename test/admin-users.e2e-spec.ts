import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, createAdmin, createUser } from './helpers/admin-fixture';
import { useAsyncFixture } from './helpers/async-fixture';
import { PASSWORD } from './helpers/auth';
import { asUser } from './helpers/test-app';

interface Page {
  items: { id: string; email: string; isActive: boolean }[];
  nextCursor: string | null;
}
const REASON = { reason: 'test reason' };

describe('admin: users', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const admin = () => asUser(ADMIN_EMAIL);
  let adminId: string;

  beforeEach(async () => {
    adminId = (await createAdmin(s.ctx)).id;
  });

  const idOf = async (email: string) =>
    (await s.ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const deactivate = (id: string) =>
    http().post(`/admin/users/${id}/deactivate`).set(admin()).send(REASON);

  it('is restricted to admins', async () => {
    await http().get('/admin/users').expect(401);
    await http().get('/admin/users').set(asUser('pat@example.com')).expect(403);
    await http().get('/admin/users').set(asUser('dr@example.com')).expect(403);
  });

  it('lists users with filters and cursor pagination, never exposing secrets', async () => {
    const doctors = (await http().get('/admin/users?role=DOCTOR').set(admin())).body as Page;
    expect(doctors.items.map((u) => u.email)).toEqual(['dr@example.com']);
    expect(doctors.items[0]).not.toHaveProperty('passwordHash');

    const found = (await http().get('/admin/users?q=PAT').set(admin())).body as Page;
    expect(found.items.map((u) => u.email)).toEqual(['pat@example.com']);

    const page1 = (await http().get('/admin/users?limit=2').set(admin())).body as Page;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (await http().get(`/admin/users?limit=2&cursor=${page1.nextCursor}`).set(admin()))
      .body as Page;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((u) => u.id)).size).toBe(3);

    await s.ctx.prisma.user.update({
      where: { email: 'pat@example.com' },
      data: { isActive: false },
    });
    const inactive = (await http().get('/admin/users?isActive=false').set(admin())).body as Page;
    expect(inactive.items.map((u) => u.email)).toEqual(['pat@example.com']);
  });

  it('deactivation revokes sessions, blocks access immediately and is audited', async () => {
    const patId = await idOf('pat@example.com');
    await s.ctx.prisma.refreshToken.create({
      data: {
        userId: patId,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await http().get('/notifications').set(asUser('pat@example.com')).expect(200);

    const res = await deactivate(patId).expect(200);
    expect(res.body).toMatchObject({
      id: patId,
      isActive: false,
      upcomingConfirmedAppointments: 0,
    });

    await http().get('/notifications').set(asUser('pat@example.com')).expect(401);
    expect(
      await s.ctx.prisma.refreshToken.count({ where: { userId: patId, revokedAt: null } }),
    ).toBe(0);

    const logs = await s.ctx.prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'user.deactivated',
      actorId: adminId,
      actorRole: 'ADMIN',
      entityType: 'user',
      entityId: patId,
    });
    expect(logs[0].metadata).toMatchObject({ reason: 'test reason' });
  });

  it('is idempotent: repeating it adds no second audit row', async () => {
    const patId = await idOf('pat@example.com');
    await deactivate(patId).expect(200);
    await deactivate(patId).expect(200);
    expect(await s.ctx.prisma.auditLog.count()).toBe(1);
  });

  it('reactivation restores access and is audited', async () => {
    const patId = await idOf('pat@example.com');
    await deactivate(patId).expect(200);
    await http().post(`/admin/users/${patId}/reactivate`).set(admin()).send(REASON).expect(200);
    await http().get('/notifications').set(asUser('pat@example.com')).expect(200);
    const actions = (await s.ctx.prisma.auditLog.findMany()).map((l) => l.action).sort();
    expect(actions).toEqual(['user.deactivated', 'user.reactivated']);
  });

  it('an admin cannot deactivate themselves', async () => {
    await deactivate(adminId).expect(409);
    expect(await s.ctx.prisma.auditLog.count()).toBe(0);
  });

  it('two admins deactivating each other at once: one wins, one admin stays active', async () => {
    const second = await createUser(s.ctx, 'admin2@example.com', 'ADMIN', 'Ad Min Two');
    const [a, b] = await Promise.all([
      http().post(`/admin/users/${second.id}/deactivate`).set(admin()).send(REASON),
      http()
        .post(`/admin/users/${adminId}/deactivate`)
        .set(asUser('admin2@example.com'))
        .send(REASON),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect([401, 403]).toContain(statuses[1]);
    expect(await s.ctx.prisma.user.count({ where: { role: 'ADMIN', isActive: true } })).toBe(1);
  });

  it('a deactivated account cannot log in', async () => {
    await s.ctx.prisma.user.update({
      where: { email: 'pat@example.com' },
      data: { passwordHash: await hash(PASSWORD, 4), emailVerifiedAt: new Date() },
    });
    const login = () =>
      http().post('/auth/login').send({ email: 'pat@example.com', password: PASSWORD });
    expect((await login()).status).toBeLessThan(300);
    await deactivate(await idOf('pat@example.com')).expect(200);
    expect((await login()).status).toBe(403);
  });
});
