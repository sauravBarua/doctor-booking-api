import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

export const LoggingModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    pinoHttp: {
      level: config.getOrThrow<string>('LOG_LEVEL'),
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      transport:
        config.get<string>('NODE_ENV') === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  }),
});
