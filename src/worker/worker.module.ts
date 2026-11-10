import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { JobsModule } from '../jobs/jobs.module';
import { LoggingModule } from '../logging/logging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { WorkerRunner } from './worker.runner';

@Module({
  imports: [LoggingModule, AppConfigModule, PrismaModule, RedisModule, JobsModule],
  providers: [WorkerRunner],
})
export class WorkerModule {}
