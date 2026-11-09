import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { asUser, createTestApp, type TestContext } from './helpers/test-app';

describe('Identity (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com');
    await createUser(ctx.prisma, 'ADMIN', 'admin@example.com');
    await createUser(ctx.prisma, 'PATIENT', 'off@example.com');
    await ctx.prisma.user.update({
      where: { email: 'off@example.com' },
      data: { isActive: false },
    });
  });

  it('rejects requests without a token', async () => {
    await http().get('/me').expect(401);
  });

  it('returns the current user for a valid token', async () => {
    const res = await http().get('/me').set(asUser('pat@example.com')).expect(200);
    expect(res.body).toMatchObject({ email: 'pat@example.com' });
  });

  it('keeps an unknown user anonymous', async () => {
    await http().get('/me').set(asUser('ghost@example.com')).expect(401);
  });

  it('rejects a deactivated user even with a valid token', async () => {
    await http().get('/me').set(asUser('off@example.com')).expect(401);
  });

  it('enforces roles on top of identity', async () => {
    await http()
      .post('/specialties')
      .set(asUser('pat@example.com'))
      .send({ name: 'X' })
      .expect(403);
    const admin = await http()
      .post('/specialties')
      .set(asUser('admin@example.com'))
      .send({ name: 'Neurology' });
    expect([401, 403]).not.toContain(admin.status);
  });
});
