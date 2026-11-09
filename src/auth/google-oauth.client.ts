import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env.schema';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(3),
  email_verified: z.boolean().default(false),
  name: z.string().optional(),
});

/** The only place that talks to Google. Tests replace it with a fake. */
@Injectable()
export class GoogleOAuthClient {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri?: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    this.redirectUri = config.get('GOOGLE_REDIRECT_URI', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  buildAuthUrl(params: { state: string; codeChallenge: string }): string {
    if (!this.clientId || !this.redirectUri) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  }

  async exchange(code: string, codeVerifier: string): Promise<GoogleProfile> {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    const tokenBody = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    const token = tokenSchema.safeParse(
      await this.fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      }),
    );
    if (!token.success) throw new UnauthorizedException('Google sign-in failed');

    // Fetched server-to-server over TLS with the token we just received from Google.
    const info = userInfoSchema.safeParse(
      await this.fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${token.data.access_token}` },
      }),
    );
    if (!info.success) throw new UnauthorizedException('Google sign-in failed');

    return {
      sub: info.data.sub,
      email: info.data.email,
      emailVerified: info.data.email_verified,
      name: info.data.name,
    };
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadGatewayException('Could not reach Google');
    }
    if (!response.ok) throw new UnauthorizedException('Google sign-in failed');
    return response.json();
  }
}
