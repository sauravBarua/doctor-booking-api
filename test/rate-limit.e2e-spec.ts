import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RateLimiterService } from '../src/rate-limit/rate-limiter.service';
import { useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

describe('rate limiting (Redis)', () => {
  const s = useAsyncFixture();
  const limiter = () => s.ctx.app.get(RateLimiterService);
  const policy = { limit: 3, windowSeconds: 60 };

  it('allows up to the limit, then denies', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter().hit('rl:test:a', policy));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it('counts each key separately', async () => {
    for (let i = 0; i < 4; i++) await limiter().hit('rl:test:a', policy);
    expect((await limiter().hit('rl:test:b', policy)).allowed).toBe(true);
  });

  it('sets a bounded reset time', async () => {
    const { resetSeconds } = await limiter().hit('rl:test:c', policy);
    expect(resetSeconds).toBeGreaterThan(0);
    expect(resetSeconds).toBeLessThanOrEqual(60);
  });

  it('answers 429 with Retry-After over HTTP, per user', async () => {
    const l = limiter();
    const original = l.defaultPolicy;
    l.enabled = true;
    l.defaultPolicy = { ...original, limit: 2 };
    try {
      const get = (email: string) =>
        request(s.ctx.app.getHttpServer()).get('/notifications/unread-count').set(asUser(email));
      await get(s.f.patient.email).expect(200);
      await get(s.f.patient.email).expect(200);
      const blocked = await get(s.f.patient.email).expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      await get(s.f.doctor.email).expect(200);
    } finally {
      l.enabled = false;
      l.defaultPolicy = original;
    }
  });
});
