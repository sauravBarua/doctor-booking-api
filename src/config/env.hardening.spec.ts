import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('env: platform settings', () => {
  it('has safe defaults', () => {
    expect(envSchema.parse(base)).toMatchObject({
      LOG_LEVEL: 'info',
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      RATE_LIMIT_ENABLED: true,
      SWAGGER_ENABLED: false,
    });
  });

  it('parses a CORS allowlist and rejects wildcards', () => {
    expect(
      envSchema.parse({ ...base, CORS_ORIGINS: ' https://a.example , https://b.example ' })
        .CORS_ORIGINS,
    ).toEqual(['https://a.example', 'https://b.example']);
    expect(envSchema.safeParse({ ...base, CORS_ORIGINS: '*' }).success).toBe(false);
  });

  it('rejects a negative TRUST_PROXY', () => {
    expect(envSchema.safeParse({ ...base, TRUST_PROXY: '-1' }).success).toBe(false);
  });
});
