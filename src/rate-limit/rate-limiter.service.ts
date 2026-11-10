import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { RateLimitPolicy } from './rate-limit.decorator';

const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;
  /** Mutable on purpose: the e2e tests switch the limiter on for a single test. */
  enabled: boolean;
  defaultPolicy: RateLimitPolicy;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: 1 });
    this.redis.on('error', (error: Error) => this.logger.warn(`redis: ${error.message}`));
    this.enabled = config.getOrThrow<boolean>('RATE_LIMIT_ENABLED');
    this.defaultPolicy = {
      name: 'default',
      limit: config.getOrThrow<number>('RATE_LIMIT_DEFAULT_PER_MINUTE'),
      windowSeconds: 60,
      by: 'user',
    };
  }

  async hit(
    key: string,
    policy: Pick<RateLimitPolicy, 'limit' | 'windowSeconds'>,
  ): Promise<RateLimitResult> {
    try {
      const [count, ttl] = (await this.redis.eval(SCRIPT, 1, key, policy.windowSeconds)) as [
        number,
        number,
      ];
      return {
        allowed: count <= policy.limit,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - count),
        resetSeconds: ttl,
      };
    } catch (error) {
      this.logger.warn(
        `rate limiter unavailable, failing open: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        allowed: true,
        limit: policy.limit,
        remaining: policy.limit,
        resetSeconds: policy.windowSeconds,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
