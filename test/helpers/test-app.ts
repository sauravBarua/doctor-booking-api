import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, prisma: moduleRef.get(PrismaService), redis: moduleRef.get(RedisService) };
}

/** Phase 4 swaps this for a real Bearer token; the tests keep calling it. */
export const asUser = (email: string) => ({ 'X-Debug-User': email });
