import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash as bcryptHash } from 'bcrypt';
import type { Env } from '../config/env.schema';

@Injectable()
export class PasswordService {
  private readonly rounds: number;
  private dummyHash?: Promise<string>;

  constructor(config: ConfigService<Env, true>) {
    this.rounds = config.get('BCRYPT_ROUNDS', { infer: true });
  }

  hash(plain: string): Promise<string> {
    return bcryptHash(plain, this.rounds);
  }

  /** Always runs one bcrypt comparison, so an unknown account takes as long as a wrong password. */
  async verify(plain: string, storedHash: string | null): Promise<boolean> {
    this.dummyHash ??= bcryptHash('dummy-password-for-timing', this.rounds);
    const matches = await compare(plain, storedHash ?? (await this.dummyHash));
    return storedHash !== null && matches;
  }
}
