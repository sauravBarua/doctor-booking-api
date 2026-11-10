import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { RELAY_BATCH_SIZE, RELAY_INTERVAL_MS } from '../common/constants';
import { CleanupService } from '../jobs/cleanup.service';
import { EmailJobHandler } from '../jobs/email-job.handler';
import { OutboxRelayService } from '../jobs/outbox-relay.service';
import { ReminderScanService } from '../jobs/reminder-scan.service';
import { bullConnection, EMAIL_QUEUE_NAME, MAINTENANCE_QUEUE_NAME } from '../queue/bull-connection';
import { parseEmailJob } from '../queue/email-job';

@Injectable()
export class WorkerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerRunner.name);
  private emailWorker?: Worker;
  private maintenanceWorker?: Worker;
  private maintenanceQueue?: Queue;
  private relayTimer?: NodeJS.Timeout;
  private relayRunning: Promise<void> = Promise.resolve();
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly relay: OutboxRelayService,
    private readonly scan: ReminderScanService,
    private readonly cleanup: CleanupService,
    private readonly handler: EmailJobHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = bullConnection(this.config.getOrThrow<string>('REDIS_URL'));

    // 1. Emails
    this.emailWorker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        await this.handler.handle(parseEmailJob(job.data), new Date());
      },
      { connection, concurrency: 5 },
    );
    this.emailWorker.on('failed', (job, err) =>
      this.logger.warn(
        `email job ${job?.id ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
      ),
    );
    this.emailWorker.on('error', (err) => this.logger.error(`email worker: ${err.message}`));

    // 2. Maintenance (repeatable, de-duplicated by scheduler id across restarts)
    this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, { connection });
    const jobOpts = { removeOnComplete: true, removeOnFail: { age: 3600 } };
    await this.maintenanceQueue.upsertJobScheduler(
      'reminder-scan',
      { every: 60_000 },
      { name: 'reminder-scan', opts: jobOpts },
    );
    await this.maintenanceQueue.upsertJobScheduler(
      'cleanup',
      { pattern: '30 3 * * *', tz: 'Europe/Paris' },
      { name: 'cleanup', opts: jobOpts },
    );
    this.maintenanceWorker = new Worker(
      MAINTENANCE_QUEUE_NAME,
      async (job) => {
        if (job.name === 'reminder-scan') await this.scan.scan(new Date());
        else if (job.name === 'cleanup')
          this.logger.log(`cleanup: ${JSON.stringify(await this.cleanup.run(new Date()))}`);
      },
      { connection, concurrency: 1 },
    );
    this.maintenanceWorker.on('failed', (job, err) =>
      this.logger.error(`maintenance job ${job?.name ?? '?'} failed: ${err.message}`),
    );
    this.maintenanceWorker.on('error', (err) =>
      this.logger.error(`maintenance worker: ${err.message}`),
    );

    // 3. Outbox relay loop
    this.scheduleRelay(0);
    this.logger.log('worker started (email, maintenance, outbox relay)');
  }

  private scheduleRelay(delayMs: number): void {
    if (this.stopping) return;
    this.relayTimer = setTimeout(() => {
      this.relayRunning = this.tickRelay();
    }, delayMs);
  }

  private async tickRelay(): Promise<void> {
    let next = RELAY_INTERVAL_MS;
    try {
      const handled = await this.relay.runOnce(RELAY_BATCH_SIZE, new Date());
      if (handled >= RELAY_BATCH_SIZE) next = 0; // backlog: keep draining
    } catch (error) {
      this.logger.error(
        `relay tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.scheduleRelay(next);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.relayTimer) clearTimeout(this.relayTimer);
    await this.relayRunning;
    await this.emailWorker?.close();
    await this.maintenanceWorker?.close();
    await this.maintenanceQueue?.close();
    this.logger.log('worker stopped');
  }
}
