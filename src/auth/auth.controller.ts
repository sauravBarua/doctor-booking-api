import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import {
  GoogleCallbackDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  RegisterDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import type { SessionMeta } from './tokens.service';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function metaOf(request: RequestLike): SessionMeta {
  const userAgent = request.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: request.ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { message: 'If this address can be registered, a verification code has been sent.' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: RequestLike) {
    return this.auth.verifyEmail(dto, metaOf(request));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() request: RequestLike) {
    return this.auth.login(dto, metaOf(request));
  }

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() dto: OtpRequestDto) {
    await this.auth.requestOtp(dto);
    return { message: 'If an account exists for this address, a code has been sent.' };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() request: RequestLike) {
    return this.auth.verifyOtp(dto, metaOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() request: RequestLike) {
    return this.auth.refresh(dto.refreshToken, metaOf(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }

  @Public()
  @Get('google/url')
  googleUrl() {
    return this.google.authorizationUrl();
  }

  @Public()
  @Get('google/callback')
  googleCallback(@Query() query: GoogleCallbackDto, @Req() request: RequestLike) {
    return this.google.signIn(query.code, query.state, metaOf(request));
  }
}
