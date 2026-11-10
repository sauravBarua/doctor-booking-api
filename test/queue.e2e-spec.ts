import { Queue, Worker } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import { bullConnection, EMAIL_QUEUE_NAME } from '../src/queue/bull-connection';
import { BullEmailQueue } from '../src/queue/email-queue';

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL missing in test env');

const otp = {
  template: 'otp' as const,
  to: 'a@example.com',
  code: '123456',
  purpose: 'login' as const,
};

describe('BullEmailQueue (real Redis)', () => {
  const reader = new Queue(EMAIL_QUEUE_NAME, { connection: bullConnection(url) });
  const queue = new BullEmailQueue(url);

  afterEach(async () => {
    await reader.obliterate({ force: true });
  });

  it('a repeated jobId is enqueued only once', async () => {
    await queue.add({ data: otp, jobId: 'dup-1' });
    await queue.add({ data: otp, jobId: 'dup-1' });
    const counts = await reader.getJobCounts('waiting', 'delayed', 'active');
    expect(counts.waiting + counts.delayed + counts.active).toBe(1);
  });

  it('OTP jobs leave no trace in Redis once completed', async () => {
    const done = new Promise<void>((resolve, reject) => {
      const worker = new Worker(EMAIL_QUEUE_NAME, () => Promise.resolve(), {
        connection: bullConnection(url),
      });
      worker.on('completed', () => {
        void worker.close().then(() => resolve());
      });
      worker.on('error', reject);
    });
    await queue.add({ data: otp, jobId: 'otp-1' });
    await done;
    expect(await reader.getJob('otp-1')).toBeUndefined();
  });
});
