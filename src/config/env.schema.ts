import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    DEV_AUTH_STUB: z.stringbool().default(false),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.DEV_AUTH_STUB), {
    message: 'DEV_AUTH_STUB must not be enabled in production',
    path: ['DEV_AUTH_STUB'],
  });

export type Env = z.infer<typeof envSchema>;
