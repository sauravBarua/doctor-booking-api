import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export abstract class MailTransport {
  abstract send(message: MailMessage): Promise<void>;
}

export class SmtpMailTransport extends MailTransport {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: {
    from: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  }) {
    super();
    this.from = options.from;
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.pass },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/** Development: prints the email (including the code) in the API console. */
export class LogMailTransport extends MailTransport {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return Promise.resolve();
  }
}

/** Tests: keeps emails in memory so a test can read the code. */
export class MemoryMailTransport extends MailTransport {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }
}
