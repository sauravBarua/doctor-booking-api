import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { resetDatabase } from './helpers/reset-db';

describe('Test harness (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    redis = moduleRef.get(RedisService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('talks to the test database and test Redis, not the dev ones', async () => {
    const [db] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(db.name).toBe('doctor_booking_test');
    expect(Number(redis.options.db)).toBe(1);
  });

  it('resetDatabase clears Redis', async () => {
    await redis.set('harness:key', '1');
    await resetDatabase(prisma, redis);
    expect(await redis.get('harness:key')).toBeNull();
  });
});
