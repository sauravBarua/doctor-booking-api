import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, type RateLimitPolicy, SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimiterService } from './rate-limiter.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.limiter.enabled || context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(SKIP_RATE_LIMIT_KEY, targets))
      return true;
    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_KEY, targets) ??
      this.limiter.defaultPolicy;

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string } }>();
    const res = http.getResponse<Response>();
    const userId = req.user?.id;
    const subject = policy.by === 'user' && userId ? `u:${userId}` : `ip:${req.ip ?? 'unknown'}`;
    const result = await this.limiter.hit(`rl:${policy.name}:${subject}`, policy);

    res.setHeader('RateLimit-Limit', String(result.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(result.resetSeconds));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.resetSeconds));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many requests, slow down',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
