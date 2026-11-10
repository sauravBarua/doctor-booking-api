import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

function parseEnvFile(path: string): Record<string, string> {
  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"(.*)"$/, '$1')] as const;
    });
  return Object.fromEntries(entries);
}

describe('.env.prod.example', () => {
  it('is a valid production configuration', () => {
    const vars = parseEnvFile('.env.prod.example');
    expect(() =>
      envSchema.parse({
        ...vars,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://doctor:doctor@postgres:5432/doctor_booking',
        REDIS_URL: 'redis://redis:6379',
      }),
    ).not.toThrow();
  });
});
