import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { MailService } from './mail.service';
import {
  LogMailTransport,
  MailTransport,
  MemoryMailTransport,
  SmtpMailTransport,
} from './mail.transport';

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

@Module({
  providers: [
    {
      provide: MailTransport,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailTransport => {
        const driver = config.get('MAIL_DRIVER', { infer: true });
        if (driver === 'memory') return new MemoryMailTransport();
        if (driver === 'log') return new LogMailTransport();
        return new SmtpMailTransport({
          from: config.get('MAIL_FROM', { infer: true }),
          host: required(config.get('SMTP_HOST', { infer: true }), 'SMTP_HOST'),
          port: config.get('SMTP_PORT', { infer: true }),
          secure: config.get('SMTP_SECURE', { infer: true }),
          user: required(config.get('SMTP_USER', { infer: true }), 'SMTP_USER'),
          pass: required(config.get('SMTP_PASS', { infer: true }), 'SMTP_PASS'),
        });
      },
    },
    MailService,
  ],
  exports: [MailService, MailTransport],
})
export class MailModule {}
