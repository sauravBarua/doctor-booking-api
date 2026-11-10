import type { OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection, EMAIL_QUEUE_NAME } from './bull-connection';
import type { EmailJobData } from './email-job';

export interface EmailJobInput {
  data: EmailJobData;
  /** Same id = same job: a retried relay cannot send the same email twice. */
  jobId?: string;
}

export abstract class EmailQueue {
  abstract add(job: EmailJobInput): Promise<void>;
}

const DEFAULT_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  // Kept a day so the job id keeps deduplicating late retries.
  removeOnComplete: { age: 86_400 },
  removeOnFail: { age: 7 * 86_400 },
};

/** One-time codes must not linger in Redis. */
const OTP_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: { age: 600 },
};

export class BullEmailQueue extends EmailQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    super();
    this.queue = new Queue(EMAIL_QUEUE_NAME, { connection: bullConnection(redisUrl) });
  }

  async add(job: EmailJobInput): Promise<void> {
    const options = job.data.template === 'otp' ? OTP_OPTIONS : DEFAULT_OPTIONS;
    await this.queue.add(job.data.template, job.data, { ...options, jobId: job.jobId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
