import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EmailJobData } from '../queue/email-job';
import { composeEmail, renderAppointment } from './appointment-content';
import { loadAppointmentInfo, recipientsFor, stillRelevant } from './appointment-info';

@Injectable()
export class EmailJobHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Runs inside the BullMQ worker. A throw makes BullMQ retry with backoff. */
  async handle(data: EmailJobData, now: Date = new Date()): Promise<'sent' | 'skipped'> {
    if (data.template === 'otp') {
      await this.mail.sendOtp(data.to, data.code, data.purpose);
      return 'sent';
    }

    // The job may have waited or been retried: look at the appointment as it is now.
    const info = await loadAppointmentInfo(this.prisma, data.appointmentId);
    if (!info || !stillRelevant(data.template, info, now)) return 'skipped';

    const recipient = recipientsFor(data.template, info).find(
      (candidate) => candidate.userId === data.recipientUserId,
    );
    if (!recipient) return 'skipped';

    const user = recipient.role === 'patient' ? info.patient : info.doctor.user;
    if (!user.isActive) return 'skipped';

    const rendered = renderAppointment(data.template, info, recipient.role);
    await this.mail.send(composeEmail(rendered, user.name, user.email));
    return 'sent';
  }
}
