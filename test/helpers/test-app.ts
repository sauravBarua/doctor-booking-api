import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { GoogleOAuthClient, type GoogleProfile } from '../../src/auth/google-oauth.client';
import { TokensService } from '../../src/auth/tokens.service';
import { configureApp } from '../../src/bootstrap/configure-app';
import { EmailJobHandler } from '../../src/jobs/email-job.handler';
import { MailTransport, MemoryMailTransport } from '../../src/mail/mail.transport';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EmailQueue } from '../../src/queue/email-queue';
import { RedisService } from '../../src/redis/redis.service';
import { InlineEmailQueue } from './inline-email-queue';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
  mail: MemoryMailTransport;
  queue: InlineEmailQueue;
}

interface FakeGoogle {
  profile: GoogleProfile;
  isConfigured(): boolean;
  buildAuthUrl(params: { state: string; codeChallenge: string }): string;
  exchange(): Promise<GoogleProfile>;
}

/** Stands in for Google. A test sets `fakeGoogle.profile` before calling the callback. */
export const fakeGoogle: FakeGoogle = {
  profile: { sub: 'google-sub-1', email: 'gina@example.com', emailVerified: true, name: 'Gina' },
  isConfigured: () => true,
  buildAuthUrl: ({ state, codeChallenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=${codeChallenge}`,
  exchange: () => Promise.resolve(fakeGoogle.profile),
};

const TEST_USER_HEADER = 'x-test-user';

interface TestRequest {
  headers: Record<string, string | string[] | undefined>;
}

export async function createTestApp(): Promise<TestContext> {
  const queue = new InlineEmailQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleOAuthClient)
    .useValue(fakeGoogle)
    .overrideProvider(EmailQueue)
    .useValue(queue)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokensService);

  // Test-only: turns "X-Test-User: email" into a real Bearer token for that user, so every
  // request still goes through the real JwtAuthGuard. Unknown emails stay anonymous (401).
  app.use((req: TestRequest, _res: unknown, next: (error?: unknown) => void) => {
    const email = req.headers[TEST_USER_HEADER];
    delete req.headers[TEST_USER_HEADER];
    if (typeof email !== 'string') {
      next();
      return;
    }
    prisma.user.findUnique({ where: { email }, select: { id: true } }).then((user) => {
      if (user) req.headers.authorization = `Bearer ${tokens.signAccessToken(user.id)}`;
      next();
    }, next);
  });

  await app.init();
  queue.handler = app.get(EmailJobHandler, { strict: false });

  return {
    app,
    prisma,
    redis: app.get(RedisService),
    mail: app.get<MemoryMailTransport>(MailTransport),
    queue,
  };
}

/** Headers that authenticate a request as the user with this email (the user must exist). */
export const asUser = (email: string): Record<string, string> => ({ 'X-Test-User': email });
