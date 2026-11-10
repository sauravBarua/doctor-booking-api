import { SetMetadata } from '@nestjs/common';

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  /** 'user' falls back to the client IP for anonymous requests. */
  by: 'ip' | 'user';
}

export const RATE_LIMIT_KEY = 'rateLimit';
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_KEY, policy);
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

export const RATE_LIMITS = {
  auth: { name: 'auth', limit: 20, windowSeconds: 60, by: 'ip' },
  upload: { name: 'upload', limit: 10, windowSeconds: 60, by: 'user' },
} satisfies Record<string, RateLimitPolicy>;
