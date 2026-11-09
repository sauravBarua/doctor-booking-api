import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, signUp, type Session } from './helpers/auth';
import { resetDatabase } from './helpers/reset-db';
import { createTestApp, type TestContext } from './helpers/test-app';

describe('Auth: sessions and tokens (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const refresh = (refreshToken: string) => http().post('/auth/refresh').send({ refreshToken });
  const me = (accessToken: string) =>
    http().get('/me').set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    ctx.mail.clear();
  });

  it('rotates refresh tokens and revokes the whole family when one is reused', async () => {
    const first = await signUp(ctx, 'a@example.com');

    const rotated = await refresh(first.refreshToken).expect(200);
    const second = rotated.body as { accessToken: string; refreshToken: string };
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await me(second.accessToken).expect(200);

    await refresh(first.refreshToken).expect(401); // reuse detected
    await refresh(second.refreshToken).expect(401); // the family is dead
  });

  it('lets exactly one of several parallel refreshes win', async () => {
    const session = await signUp(ctx, 'race@example.com');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => refresh(session.refreshToken)),
    );
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 401)).toHaveLength(4);
  });

  it('ends the session on logout, and ignores unknown tokens', async () => {
    const session = await signUp(ctx, 'out@example.com');
    await http().post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await refresh(session.refreshToken).expect(401);

    await http()
      .post('/auth/logout')
      .send({ refreshToken: 'x'.repeat(40) })
      .expect(204);
  });

  it('revokes every session of the user on logout-all', async () => {
    const first = await signUp(ctx, 'multi@example.com');
    const second = (
      await http()
        .post('/auth/login')
        .send({ email: 'multi@example.com', password: PASSWORD })
        .expect(200)
    ).body as Session;

    await http()
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(204);

    await refresh(first.refreshToken).expect(401);
    await refresh(second.refreshToken).expect(401);
    await http().post('/auth/logout-all').expect(401);
  });

  it('rejects missing, malformed, expired, foreign-signed and unsigned tokens', async () => {
    const session = await signUp(ctx, 'tokens@example.com');
    const jwt = ctx.app.get(JwtService);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

    const expired = jwt.sign({}, { subject: session.user.id, expiresIn: -10 });
    const foreign = jwt.sign({}, { subject: session.user.id, secret: 'f'.repeat(48) });
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: session.user.id,
      iss: 'doctor-booking-api',
    })}.`;

    const attempts: (string | undefined)[] = [
      undefined,
      'Bearer',
      'Bearer garbage',
      'Basic dXNlcjpwYXNz',
      `Bearer ${expired}`,
      `Bearer ${foreign}`,
      `Bearer ${unsigned}`,
    ];
    for (const authorization of attempts) {
      const base = http().get('/me');
      await (authorization ? base.set('Authorization', authorization) : base).expect(401);
    }
    await me(session.accessToken).expect(200);
  });

  it('stops honoring tokens when the user is deactivated or deleted', async () => {
    const session = await signUp(ctx, 'gone@example.com');

    await ctx.prisma.user.update({ where: { id: session.user.id }, data: { isActive: false } });
    await me(session.accessToken).expect(401);
    await refresh(session.refreshToken).expect(401);
    await http()
      .post('/auth/login')
      .send({ email: 'gone@example.com', password: PASSWORD })
      .expect(403);

    await ctx.prisma.user.delete({ where: { id: session.user.id } });
    await me(session.accessToken).expect(401);
  });

  it('takes the role from the database, not from the token', async () => {
    const session = await signUp(ctx, 'promoted@example.com');
    const create = () =>
      http()
        .post('/specialties')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ name: 'Neurology' });

    await create().expect(403);
    await ctx.prisma.user.update({ where: { id: session.user.id }, data: { role: 'ADMIN' } });

    const after = await create();
    expect(after.status).not.toBe(401);
    expect(after.status).not.toBe(403);
  });
});
