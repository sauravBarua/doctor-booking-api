import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

const failedKeys = (input: Record<string, string>): string[] => {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
};

describe('env schema', () => {
  it('accepts a minimal environment and applies defaults', () => {
    expect(envSchema.parse(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      BCRYPT_ROUNDS: 12,
      MAIL_DRIVER: 'log',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
    });
  });

  it('rejects a short JWT secret', () => {
    expect(failedKeys({ ...base, JWT_ACCESS_SECRET: 'too-short' })).toContain('JWT_ACCESS_SECRET');
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _unused, ...rest } = base;
    expect(failedKeys(rest)).toContain('DATABASE_URL');
  });

  it('treats empty values, as in a fresh .env, as not set', () => {
    const env = envSchema.parse({
      ...base,
      SMTP_PASS: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    });
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('requires SMTP credentials when the driver is smtp', () => {
    const keys = failedKeys({ ...base, MAIL_DRIVER: 'smtp' });
    expect(keys).toEqual(expect.arrayContaining(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']));

    const complete = envSchema.parse({
      ...base,
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'someone@gmail.com',
      SMTP_PASS: 'app-password',
    });
    expect(complete).toMatchObject({ SMTP_PORT: 465, SMTP_SECURE: true });
  });

  it('requires the Google id and secret together, and a redirect when enabled', () => {
    expect(failedKeys({ ...base, GOOGLE_CLIENT_ID: 'id' })).toContain('GOOGLE_CLIENT_ID');
    expect(failedKeys({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).toContain(
      'GOOGLE_REDIRECT_URI',
    );
    expect(
      failedKeys({
        ...base,
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
        GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
      }),
    ).toEqual([]);
  });

  it('forbids the log and memory mail drivers in production', () => {
    expect(failedKeys({ ...base, NODE_ENV: 'production', MAIL_DRIVER: 'log' })).toContain(
      'MAIL_DRIVER',
    );
    expect(failedKeys({ ...base, NODE_ENV: 'production', MAIL_DRIVER: 'memory' })).toContain(
      'MAIL_DRIVER',
    );
  });

  it('rejects a weak bcrypt cost in production only', () => {
    const production = { ...base, NODE_ENV: 'production', BCRYPT_ROUNDS: '8' };
    expect(failedKeys({ ...production, MAIL_DRIVER: 'smtp' })).toContain('BCRYPT_ROUNDS');
    expect(failedKeys({ ...base, NODE_ENV: 'test', BCRYPT_ROUNDS: '4' })).toEqual([]);
  });
});
