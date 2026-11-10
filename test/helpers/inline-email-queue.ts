import type { EmailJobHandler } from '../../src/jobs/email-job.handler';
import { EmailQueue, type EmailJobInput } from '../../src/queue/email-queue';

/** Test double: runs the handler synchronously and dedupes by jobId like BullMQ does. */
export class InlineEmailQueue extends EmailQueue {
  handler?: EmailJobHandler;
  readonly added: EmailJobInput[] = [];
  private readonly seen = new Set<string>();

  async add(job: EmailJobInput): Promise<void> {
    if (job.jobId) {
      if (this.seen.has(job.jobId)) return;
      this.seen.add(job.jobId);
    }
    this.added.push(job);
    if (this.handler) await this.handler.handle(job.data, new Date());
  }

  clear(): void {
    this.added.length = 0;
    this.seen.clear();
  }
}
