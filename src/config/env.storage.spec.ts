import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('env: storage', () => {
  it('defaults to the memory driver', () => {
    expect(envSchema.parse(base).STORAGE_DRIVER).toBe('memory');
  });

  it('requires all Cloudinary credentials for the cloudinary driver', () => {
    expect(envSchema.safeParse({ ...base, STORAGE_DRIVER: 'cloudinary' }).success).toBe(false);
    expect(
      envSchema.safeParse({
        ...base,
        STORAGE_DRIVER: 'cloudinary',
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: '1',
      }).success,
    ).toBe(false);
  });

  it('accepts the cloudinary driver with credentials', () => {
    const parsed = envSchema.parse({
      ...base,
      STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123',
      CLOUDINARY_API_SECRET: 'test-only',
    });
    expect(parsed.STORAGE_DRIVER).toBe('cloudinary');
  });
});
