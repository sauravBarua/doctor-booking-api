import request from 'supertest';
import type { MailMessage, MemoryMailTransport } from '../../src/mail/mail.transport';
import type { TestContext } from './test-app';

export const PASSWORD = 'Sup3r-secret-pw';

export interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string; name: string; role: string };
}

export function mailsTo(mail: MemoryMailTransport, email: string): MailMessage[] {
  return mail.sent.filter((message) => message.to === email);
}

export function codeIn(message: MailMessage | undefined): string {
  const match = message ? /\b(\d{6})\b/.exec(message.text) : null;
  if (!match) throw new Error('No 6-digit code found in the email');
  return match[1];
}

/** Registers a patient and verifies the email with the emailed code. */
export async function signUp(
  ctx: TestContext,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  await request(ctx.app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Test Patient', email, password })
    .expect(202);
  const code = codeIn(mailsTo(ctx.mail, email).at(-1));
  const res = await request(ctx.app.getHttpServer())
    .post('/auth/verify-email')
    .send({ email, code })
    .expect(200);
  return res.body as Session;
}
