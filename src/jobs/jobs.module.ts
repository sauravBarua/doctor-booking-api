import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { CleanupService } from './cleanup.service';
import { EmailJobHandler } from './email-job.handler';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';
import { ReminderScanService } from './reminder-scan.service';

const providers = [
  OutboxService,
  OutboxRelayService,
  ReminderScanService,
  CleanupService,
  EmailJobHandler,
];

@Module({
  imports: [MailModule, QueueModule],
  providers,
  exports: providers,
})
export class JobsModule {}
