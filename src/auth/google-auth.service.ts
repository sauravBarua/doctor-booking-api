import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OAUTH_STATE_TTL_SECONDS } from '../common/constants';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import type { User } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';
import { GoogleOAuthClient, type GoogleProfile } from './google-oauth.client';
import type { SessionMeta } from './tokens.service';

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly client: GoogleOAuthClient,
    private readonly auth: AuthService,
  ) {}

  private requireConfigured(): void {
    if (!this.client.isConfigured()) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
  }

  /** State protects against CSRF, the PKCE verifier against a stolen authorization code. */
  async authorizationUrl(): Promise<{ url: string }> {
    this.requireConfigured();
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(verifier).digest('base64url');

    await this.redis.set(`oauth:google:${state}`, verifier, 'EX', OAUTH_STATE_TTL_SECONDS);
    return { url: this.client.buildAuthUrl({ state, codeChallenge }) };
  }

  async signIn(code: string, state: string, meta: SessionMeta) {
    this.requireConfigured();

    // GETDEL: a state can be used once, even if the first attempt fails.
    const verifier = await this.redis.getdel(`oauth:google:${state}`);
    if (verifier === null) throw new BadRequestException('Invalid or expired state');

    const profile = await this.client.exchange(code, verifier);
    if (!profile.emailVerified) {
      throw new ForbiddenException('Your Google email address is not verified');
    }

    const user = await this.findOrCreate(profile);
    if (!user.isActive) throw new ForbiddenException('Account disabled');
    return this.auth.issueSession(user, meta);
  }

  private async findOrCreate(profile: GoogleProfile): Promise<User> {
    const email = profile.email.trim().toLowerCase();

    const linked = await this.prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (linked) return linked;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.googleId && existing.googleId !== profile.sub) {
        throw new ConflictException('This account is linked to another Google account');
      }
      // Google vouches for the address: link it, and drop a password set by a possible squatter.
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: profile.sub,
          ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), passwordHash: null }),
        },
      });
    }

    try {
      return await this.prisma.user.create({
        data: {
          email,
          name: profile.name?.trim() || email.split('@')[0],
          role: Role.PATIENT,
          googleId: profile.sub,
          emailVerifiedAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A parallel callback created the account first.
      return this.prisma.user.findUniqueOrThrow({ where: { googleId: profile.sub } });
    }
  }
}
