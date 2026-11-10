import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';
import { QueueModule } from '../queue/queue.module';
import { AttemptLimiter } from './attempt-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleOAuthClient } from './google-oauth.client';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    QueueModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          issuer: 'doctor-booking-api',
        },
        verifyOptions: { algorithms: ['HS256'], issuer: 'doctor-booking-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    GoogleOAuthClient,
    TokensService,
    OtpService,
    PasswordService,
    AttemptLimiter,
  ],
  exports: [TokensService],
})
export class AuthModule {}
