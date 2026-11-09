import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TEMPORARY. Stands in for JWT auth until Phase 4. Identity = the X-Debug-User header (an email).
 * Fails closed: when DEV_AUTH_STUB is not "true", every non-public route is a 401.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!this.config.getOrThrow<boolean>('DEV_AUTH_STUB')) {
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers['x-debug-user'];
    const email = typeof header === 'string' ? header.trim().toLowerCase() : '';
    if (!email) throw new UnauthorizedException('Missing X-Debug-User header');

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Unknown or inactive user');

    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}
