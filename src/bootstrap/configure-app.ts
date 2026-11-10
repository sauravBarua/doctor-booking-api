import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Shared by main.ts and the e2e harness, so tests exercise the real settings. */
export function configureApp(app: INestApplication): void {
  const server = app as NestExpressApplication;
  const config = app.get(ConfigService);
  const swagger = config.getOrThrow<boolean>('SWAGGER_ENABLED');

  server.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY'));
  server.use(
    helmet({
      contentSecurityPolicy: swagger
        ? false
        : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );

  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');
  if (origins.length > 0) {
    server.enableCors({ origin: origins, credentials: true, maxAge: 600 });
  }
  server.enableShutdownHooks();
}
