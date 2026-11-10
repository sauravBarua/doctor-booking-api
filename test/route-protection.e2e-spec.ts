import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from './helpers/test-app';

/** Routes that are public on purpose. Adding to this list is a deliberate decision. */
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /specialties',
  'GET /specialties/:id',
  'GET /clinics',
  'GET /clinics/:id',
  'GET /doctors',
  'GET /doctors/:id',
  'GET /doctors/:id/slots',
  'POST /auth/register',
  'POST /auth/verify-email',
  'POST /auth/login',
  'POST /auth/otp/request',
  'POST /auth/otp/verify',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /auth/google/url',
  'GET /auth/google/callback',
]);

const SOME_ID = '01a1c076-4c67-704f-ad0c-a15f1cad7640';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function listRoutes(app: INestApplication): { method: string; path: string }[] {
  const instance = app.getHttpAdapter().getInstance() as { router?: { stack?: RouteLayer[] } };
  const stack = instance.router?.stack;
  if (!Array.isArray(stack)) throw new Error('Cannot read the Express route table');

  return stack.flatMap(({ route }) =>
    // Catch-all middleware registrations (e.g. the request logger's `{*path}`) are not endpoints.
    route && typeof route.path === 'string' && route.path.startsWith('/')
      ? Object.keys(route.methods)
          .filter((method) => route.methods[method])
          .map((method) => ({ method, path: route.path }))
      : [],
  );
}

describe('Route protection (e2e)', () => {
  let ctx: TestContext;

  const send = (method: string, path: string) =>
    (
      request(ctx.app.getHttpServer()) as unknown as Record<
        string,
        (url: string) => Promise<{ status: number }>
      >
    )[method](path.replace(/:\w+/g, SOME_ID));

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('answers 401 on every route that is not explicitly public', async () => {
    const routes = listRoutes(ctx.app);
    expect(routes.length).toBeGreaterThan(20);

    const open: string[] = [];
    for (const { method, path } of routes) {
      if (PUBLIC_ROUTES.has(`${method.toUpperCase()} ${path}`)) continue;
      try {
        const res = await send(method, path);
        if (res.status !== 401) open.push(`${method.toUpperCase()} ${path} -> ${res.status}`);
      } catch (error) {
        open.push(`${method.toUpperCase()} ${path} -> threw ${String(error)}`);
      }
    }
    expect(open).toEqual([]);
  });

  it('keeps the public allowlist honest', async () => {
    const existing = new Set(
      listRoutes(ctx.app).map(({ method, path }) => `${method.toUpperCase()} ${path}`),
    );
    expect([...PUBLIC_ROUTES].filter((key) => !existing.has(key))).toEqual([]);

    for (const key of PUBLIC_ROUTES) {
      const [method, path] = key.split(' ');
      const res = await send(method.toLowerCase(), path);
      expect(res.status, key).not.toBe(401);
    }
  });
});
