import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

type RefreshDb = Pick<Prisma.TransactionClient, 'refreshToken'>;

@Injectable()
export class TokensService {
  readonly accessExpiresIn: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.accessExpiresIn = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60_000;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  signAccessToken(userId: string): string {
    return this.jwt.sign({}, { subject: userId });
  }

  /** The user id inside a valid access token. Signature, expiry, issuer and algorithm are checked. */
  async verifyAccessToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      if (typeof payload.sub !== 'string') throw new Error('Missing subject');
      return payload.sub;
    } catch {
      throw new UnauthorizedException();
    }
  }

  async issueRefreshToken(
    userId: string,
    meta: SessionMeta,
    familyId: string = randomUUID(),
    db: RefreshDb = this.prisma,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });
    return raw;
  }

  /**
   * Exchanges a refresh token for a new one. Presenting a token that was already used means it
   * leaked (or two clients raced): the whole family is revoked.
   */
  async rotate(
    rawToken: string,
    meta: SessionMeta,
  ): Promise<{ userId: string; refreshToken: string }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { isActive: true } },
      },
    });
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.expiresAt <= new Date() || !row.user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const next = await this.prisma.$transaction(async (tx) => {
      // Conditional update: of several parallel rotations, exactly one matches.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return null;
      return this.issueRefreshToken(row.userId, meta, row.familyId, tx);
    });

    if (next === null) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { userId: row.userId, refreshToken: next };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored on purpose. */
  async revokeByToken(rawToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
