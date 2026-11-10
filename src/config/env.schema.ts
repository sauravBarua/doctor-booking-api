import { z } from 'zod';

/** An empty value in .env ("GOOGLE_CLIENT_ID=") means "not set". */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    MAIL_DRIVER: z.enum(['smtp', 'log', 'memory']).default('log'),
    MAIL_FROM: z.string().trim().min(1).default('Doctor Booking <no-reply@localhost>'),
    SMTP_HOST: optionalText,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: z.stringbool().default(true),
    SMTP_USER: optionalText,
    SMTP_PASS: optionalText,

    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    GOOGLE_REDIRECT_URI: optionalText,

    STORAGE_DRIVER: z.enum(['cloudinary', 'memory']).default('memory'),
    CLOUDINARY_CLOUD_NAME: optionalText,
    CLOUDINARY_API_KEY: optionalText,
    CLOUDINARY_API_SECRET: optionalText,

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // The BFF is the only client, so leave this empty in production (no browser calls the API).
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .refine((list) => !list.includes('*'), 'Wildcard origins are not allowed'),
    // Number of proxy hops to trust for req.ip (BFF / load balancer).
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    RATE_LIMIT_ENABLED: z.stringbool().default(true),
    RATE_LIMIT_DEFAULT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    SWAGGER_ENABLED: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when MAIL_DRIVER=smtp`,
          });
        }
      }
    }

    const hasId = Boolean(env.GOOGLE_CLIENT_ID);
    const hasSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
    if (hasId !== hasSecret) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_ID'],
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither',
      });
    } else if (hasId && !env.GOOGLE_REDIRECT_URI) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_REDIRECT_URI'],
        message: 'GOOGLE_REDIRECT_URI is required when Google sign-in is enabled',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.MAIL_DRIVER !== 'smtp') {
        ctx.addIssue({
          code: 'custom',
          path: ['MAIL_DRIVER'],
          message: 'MAIL_DRIVER must be "smtp" in production (log and memory expose codes)',
        });
      }
      if (env.BCRYPT_ROUNDS < 10) {
        ctx.addIssue({
          code: 'custom',
          path: ['BCRYPT_ROUNDS'],
          message: 'BCRYPT_ROUNDS must be at least 10 in production',
        });
      }
    }
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'cloudinary') {
      for (const key of [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=cloudinary`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER !== 'cloudinary') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'STORAGE_DRIVER must be cloudinary in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
