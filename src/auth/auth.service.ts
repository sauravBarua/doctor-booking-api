import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LOGIN_FAILURE_WINDOW_SECONDS, LOGIN_MAX_FAILURES } from '../common/constants';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import type { User } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import type { OtpPurpose } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueue } from '../queue/email-queue';
import { AttemptLimiter } from './attempt-limiter.service';
import type {
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  RegisterDto,
  VerifyEmailDto,
} from './auth.dto';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokensService, type SessionMeta } from './tokens.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface SessionResponse extends TokenPair {
  user: { id: string; email: string; name: string; role: Role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly emailQueue: EmailQueue,
    private readonly limiter: AttemptLimiter,
  ) {}

  async issueSession(
    user: Pick<User, 'id' | 'email' | 'name' | 'role'>,
    meta: SessionMeta,
  ): Promise<SessionResponse> {
    const refreshToken = await this.tokens.issueRefreshToken(user.id, meta);
    return {
      accessToken: this.tokens.signAccessToken(user.id),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessExpiresIn,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  /** First proof of ownership of an address: any password set before it is discarded. */
  async confirmOwnership(user: User): Promise<User> {
    if (user.emailVerifiedAt) return user;
    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), passwordHash: null },
    });
  }

  private async sendCode(purpose: OtpPurpose, email: string): Promise<void> {
    const code = await this.otp.issue(purpose, email);
    if (code === null) return; // resend cooldown

    // One Redis write: no SMTP latency in the request, so no timing leak either.
    await this.emailQueue.add({ data: { template: 'otp', to: email, code, purpose } });
  }

  async register(dto: RegisterDto): Promise<void> {
    // Hash first, always: the work must not reveal whether the address is taken.
    const passwordHash = await this.passwords.hash(dto.password);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing && (existing.emailVerifiedAt || existing.role !== Role.PATIENT)) return;

    try {
      if (existing) {
        // Unverified: whoever registers last wins, but nobody gets in without the emailed code.
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { name: dto.name, passwordHash },
        });
      } else {
        await this.prisma.user.create({
          data: { email: dto.email, name: dto.name, role: Role.PATIENT, passwordHash },
        });
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // the same address registered in parallel
    }
    await this.sendCode('register', dto.email);
  }

  async verifyEmail(dto: VerifyEmailDto, meta: SessionMeta): Promise<SessionResponse> {
    if (!(await this.otp.verify('register', dto.email, dto.code))) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isActive) throw new UnauthorizedException('Invalid or expired code');

    const verified = user.emailVerifiedAt
      ? user
      : await this.prisma.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
    return this.issueSession(verified, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<SessionResponse> {
    const failuresKey = `login:fail:${dto.email}`;
    if (await this.limiter.isBlocked(failuresKey, LOGIN_MAX_FAILURES)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordOk = await this.passwords.verify(dto.password, user?.passwordHash ?? null);
    if (!user || !passwordOk) {
      await this.limiter.recordFailure(failuresKey, LOGIN_FAILURE_WINDOW_SECONDS);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) throw new ForbiddenException('Account disabled');
    if (!user.emailVerifiedAt) {
      await this.sendCode('register', user.email);
      throw new ForbiddenException('Email not verified. A new code has been sent.');
    }

    await this.limiter.reset(failuresKey);
    return this.issueSession(user, meta);
  }

  async requestOtp(dto: OtpRequestDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { isActive: true },
    });
    if (user?.isActive) await this.sendCode('login', dto.email);
  }

  async verifyOtp(dto: OtpVerifyDto, meta: SessionMeta): Promise<SessionResponse> {
    if (!(await this.otp.verify('login', dto.email, dto.code))) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isActive) throw new UnauthorizedException('Invalid or expired code');

    return this.issueSession(await this.confirmOwnership(user), meta);
  }

  async refresh(refreshToken: string, meta: SessionMeta): Promise<TokenPair> {
    const rotated = await this.tokens.rotate(refreshToken, meta);
    return {
      accessToken: this.tokens.signAccessToken(rotated.userId),
      refreshToken: rotated.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessExpiresIn,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeByToken(refreshToken);
  }

  logoutAll(userId: string): Promise<void> {
    return this.tokens.revokeAllForUser(userId);
  }
}
