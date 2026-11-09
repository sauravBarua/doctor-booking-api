import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from '../common/constants';
import type { Env } from '../config/env.schema';
import type { OtpPurpose } from '../mail/mail.templates';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OtpService {
  private readonly secret: string;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  private keys(purpose: OtpPurpose, email: string) {
    const id = `${purpose}:${email}`;
    return {
      code: `otp:code:${id}`,
      attempts: `otp:attempts:${id}`,
      cooldown: `otp:cooldown:${id}`,
    };
  }

  private digest(purpose: OtpPurpose, email: string, code: string): string {
    return createHmac('sha256', this.secret).update(`${purpose}:${email}:${code}`).digest('hex');
  }

  /** A fresh code, or null while the resend cooldown is running. */
  async issue(purpose: OtpPurpose, email: string): Promise<string | null> {
    const keys = this.keys(purpose, email);
    const acquired = await this.redis.set(
      keys.cooldown,
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (acquired === null) return null;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(keys.code, this.digest(purpose, email, code), 'EX', OTP_TTL_SECONDS);
    await this.redis.del(keys.attempts);
    return code;
  }

  async verify(purpose: OtpPurpose, email: string, code: string): Promise<boolean> {
    const keys = this.keys(purpose, email);

    // INCR is atomic: parallel guesses cannot exceed the attempt budget.
    const attempts = await this.redis.incr(keys.attempts);
    if (attempts === 1) await this.redis.expire(keys.attempts, OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.del(keys.code);
      return false;
    }

    const stored = await this.redis.get(keys.code);
    if (stored === null) return false;

    const expected = Buffer.from(stored);
    const given = Buffer.from(this.digest(purpose, email, code));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

    // DEL returns 1 for exactly one caller: a code is consumed once, even under a race.
    return (await this.redis.del(keys.code)) === 1;
  }
}
