import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AttemptLimiter {
  constructor(private readonly redis: RedisService) {}

  async isBlocked(key: string, limit: number): Promise<boolean> {
    return Number((await this.redis.get(key)) ?? 0) >= limit;
  }

  async recordFailure(key: string, windowSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
