import { Injectable } from '@nestjs/common';
import { otpMessage, type OtpPurpose } from './mail.templates';
import { MailTransport } from './mail.transport';

@Injectable()
export class MailService {
  constructor(private readonly transport: MailTransport) {}

  sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    return this.transport.send(otpMessage(to, code, purpose));
  }
}
