import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
};

describe('envSchema', () => {
  it('applies defaults', () => {
    const env = envSchema.parse(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('coerces PORT from a string', () => {
    expect(envSchema.parse({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(envSchema.safeParse({ REDIS_URL: valid.REDIS_URL }).success).toBe(false);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(envSchema.safeParse({ ...valid, NODE_ENV: 'staging' }).success).toBe(false);
  });
});
