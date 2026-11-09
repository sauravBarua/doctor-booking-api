import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './helpers/auth';
import { resetDatabase } from './helpers/reset-db';
import { createTestApp, fakeGoogle, type TestContext } from './helpers/test-app';

describe('Auth: Google sign-in (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  const startFlow = async (): Promise<string> => {
    const res = await http().get('/auth/google/url').expect(200);
    const state = new URL((res.body as { url: string }).url).searchParams.get('state');
    if (!state) throw new Error('No state in the authorization URL');
    return state;
  };
  const callback = (state: string) =>
    http().get(`/auth/google/callback?code=abc123&state=${state}`);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    ctx.mail.clear();
    fakeGoogle.profile = {
      sub: 'google-sub-1',
      email: 'gina@example.com',
      emailVerified: true,
      name: 'Gina',
    };
  });

  it('builds an authorization URL with a single-use state and PKCE', async () => {
    const res = await http().get('/auth/google/url').expect(200);
    const url = new URL((res.body as { url: string }).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();

    const state = url.searchParams.get('state');
    expect(await ctx.redis.ttl(`oauth:google:${state}`)).toBeGreaterThan(0);
  });

  it('creates a verified patient on first sign-in and reuses it afterwards', async () => {
    fakeGoogle.profile = { ...fakeGoogle.profile, email: 'Gina@Example.com' };

    const first = (await callback(await startFlow()).expect(200)).body as Session;
    expect(first.user).toMatchObject({ email: 'gina@example.com', role: 'PATIENT', name: 'Gina' });

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: first.user.id } });
    expect(stored).toMatchObject({ googleId: 'google-sub-1', passwordHash: null });
    expect(stored.emailVerifiedAt).not.toBeNull();

    const second = (await callback(await startFlow()).expect(200)).body as Session;
    expect(second.user.id).toBe(first.user.id);
    expect(await ctx.prisma.user.count()).toBe(1);

    await http().get('/me').set('Authorization', `Bearer ${second.accessToken}`).expect(200);
  });

  it("links an existing account by verified email and drops a squatter's password", async () => {
    await http()
      .post('/auth/register')
      .send({ name: 'Mallory', email: 'gina@example.com', password: 'Attacker-pass-123' })
      .expect(202);

    const session = (await callback(await startFlow()).expect(200)).body as Session;
    const stored = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'gina@example.com' },
    });
    expect(stored.id).toBe(session.user.id);
    expect(stored.googleId).toBe('google-sub-1');
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.passwordHash).toBeNull();
  });

  it('refuses unverified Google emails, bad or reused state, and disabled accounts', async () => {
    fakeGoogle.profile = { ...fakeGoogle.profile, emailVerified: false };
    await callback(await startFlow()).expect(403);

    fakeGoogle.profile = { ...fakeGoogle.profile, emailVerified: true };
    await callback('not-a-known-state-value').expect(400);

    const state = await startFlow();
    await callback(state).expect(200);
    await callback(state).expect(400);

    await ctx.prisma.user.updateMany({ data: { isActive: false } });
    await callback(await startFlow()).expect(403);
  });
});
