import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { BullEmailQueue, EmailQueue } from './email-queue';

@Module({
  providers: [
    {
      provide: EmailQueue,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailQueue =>
        new BullEmailQueue(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [EmailQueue],
})
export class QueueModule {}
