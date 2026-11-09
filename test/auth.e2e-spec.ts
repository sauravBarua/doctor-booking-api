import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { codeIn, mailsTo, PASSWORD, signUp, type Session } from './helpers/auth';
import { createClinic, createDoctor, createSpecialty, createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { createTestApp, type TestContext } from './helpers/test-app';

describe('Auth: registration, passwords and one-time codes (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });
  const requestCode = (email: string) => http().post('/auth/otp/request').send({ email });
  const verifyCode = (email: string, code: string) =>
    http().post('/auth/otp/verify').send({ email, code });
  const bearer = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    ctx.mail.clear();
  });

  it('registers, emails a French code, verifies and returns a working session', async () => {
    const email = 'new.patient@example.com';
    await http()
      .post('/auth/register')
      .send({ name: 'New Patient', email: 'New.Patient@Example.com', password: PASSWORD })
      .expect(202);

    const mails = mailsTo(ctx.mail, email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe('Confirmez votre adresse e-mail');

    const verified = await http()
      .post('/auth/verify-email')
      .send({ email, code: codeIn(mails[0]) })
      .expect(200);
    const session = verified.body as Session;
    expect(session).toMatchObject({ tokenType: 'Bearer', user: { email, role: 'PATIENT' } });

    const me = await http().get('/me').set(bearer(session)).expect(200);
    expect(me.body).toMatchObject({ email });

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('enforces the password policy and answers the same for a taken address', async () => {
    const send = (password: string) =>
      http().post('/auth/register').send({ name: 'Some One', email: 'x@example.com', password });
    await send('short').expect(400);
    await send('a'.repeat(73)).expect(400);

    await createUser(ctx.prisma, 'PATIENT', 'taken@example.com');
    await ctx.prisma.user.update({
      where: { email: 'taken@example.com' },
      data: { emailVerifiedAt: new Date() },
    });
    await http()
      .post('/auth/register')
      .send({ name: 'Intruder', email: 'taken@example.com', password: PASSWORD })
      .expect(202);

    expect(mailsTo(ctx.mail, 'taken@example.com')).toHaveLength(0);
    const stored = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'taken@example.com' },
    });
    expect(stored.passwordHash).toBeNull();
  });

  it('refuses password login before verification, then allows it', async () => {
    const email = 'late@example.com';
    await http()
      .post('/auth/register')
      .send({ name: 'Late One', email, password: PASSWORD })
      .expect(202);

    const refused = await login(email, PASSWORD).expect(403);
    expect((refused.body as { message: string }).message).toMatch(/not verified/i);

    await http()
      .post('/auth/verify-email')
      .send({ email, code: codeIn(mailsTo(ctx.mail, email)[0]) })
      .expect(200);
    await login(email, PASSWORD).expect(200);
  });

  it('answers the same for a wrong password and an unknown address', async () => {
    await signUp(ctx, 'known@example.com');
    const wrong = await login('known@example.com', 'Wrong-password-1').expect(401);
    const unknown = await login('nobody@example.com', PASSWORD).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('throttles repeated failed logins, even for the right password', async () => {
    await signUp(ctx, 'target@example.com');
    for (let attempt = 0; attempt < 10; attempt++) {
      await login('target@example.com', 'Wrong-password-1').expect(401);
    }
    await login('target@example.com', PASSWORD).expect(429);
  });

  it('logs in with an emailed one-time code, once only', async () => {
    const email = 'otp@example.com';
    await createUser(ctx.prisma, 'PATIENT', email);

    await requestCode(email).expect(202);
    const mail = mailsTo(ctx.mail, email)[0];
    expect(mail.subject).toBe('Votre code de connexion');
    const code = codeIn(mail);

    await verifyCode(email, '12ab56').expect(400);
    const ok = await verifyCode(email, code).expect(200);
    const session = ok.body as Session;
    await http().get('/me').set(bearer(session)).expect(200);

    await verifyCode(email, code).expect(401);
  });

  it('gives no hint about unknown addresses and respects the resend cooldown', async () => {
    await requestCode('ghost@example.com').expect(202);
    expect(ctx.mail.sent).toHaveLength(0);

    await createUser(ctx.prisma, 'PATIENT', 'real@example.com');
    await requestCode('real@example.com').expect(202);
    await requestCode('real@example.com').expect(202);
    expect(mailsTo(ctx.mail, 'real@example.com')).toHaveLength(1);
  });

  it('locks a code after five wrong attempts', async () => {
    const email = 'locked@example.com';
    await createUser(ctx.prisma, 'PATIENT', email);
    await requestCode(email).expect(202);
    const code = codeIn(mailsTo(ctx.mail, email)[0]);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt++) await verifyCode(email, wrong).expect(401);
    await verifyCode(email, code).expect(401);
  });

  it('lets an admin-created doctor without a password sign in with a code', async () => {
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    await createDoctor(ctx.prisma, {
      email: 'dr@example.com',
      name: 'Dr Who',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });

    await requestCode('dr@example.com').expect(202);
    const res = await verifyCode(
      'dr@example.com',
      codeIn(mailsTo(ctx.mail, 'dr@example.com')[0]),
    ).expect(200);
    const session = res.body as Session;
    expect(session.user.role).toBe('DOCTOR');
    await http().get('/doctors/me').set(bearer(session)).expect(200);
  });

  it("discards a squatter's password when the real owner proves the address", async () => {
    const email = 'victim@example.com';
    await http()
      .post('/auth/register')
      .send({ name: 'Mallory', email, password: 'Attacker-pass-123' })
      .expect(202);

    await requestCode(email).expect(202);
    const loginMail = mailsTo(ctx.mail, email).find((m) => m.subject === 'Votre code de connexion');
    await verifyCode(email, codeIn(loginMail)).expect(200);

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.passwordHash).toBeNull();
    await login(email, 'Attacker-pass-123').expect(401);
  });
});
