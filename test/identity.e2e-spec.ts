import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { asUser, createTestApp, type TestContext } from './helpers/test-app';

describe('Identity stub (e2e)', () => {
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
  });

  it('rejects requests without the debug header', async () => {
    await http().get('/me').expect(401);
  });

  it('rejects unknown users', async () => {
    await http().get('/me').set(asUser('nobody@example.com')).expect(401);
  });

  it('rejects deactivated users', async () => {
    const user = await createUser(ctx.prisma, 'PATIENT', 'gone@example.com');
    await ctx.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await http().get('/me').set(asUser('gone@example.com')).expect(401);
  });

  it('resolves the user and role from the header', async () => {
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com', 'Pat Ient');
    const res = await http().get('/me').set(asUser('Pat@Example.com')).expect(200);
    expect(res.body).toMatchObject({ email: 'pat@example.com', name: 'Pat Ient', role: 'PATIENT' });
  });

  it('enforces roles: a patient cannot create a specialty, an admin can', async () => {
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com');
    await createUser(ctx.prisma, 'ADMIN', 'admin@example.com');

    await http()
      .post('/specialties')
      .set(asUser('pat@example.com'))
      .send({ name: 'Cardiology' })
      .expect(403);
    await http()
      .post('/specialties')
      .set(asUser('admin@example.com'))
      .send({ name: 'Cardiology' })
      .expect(201);
  });
});
