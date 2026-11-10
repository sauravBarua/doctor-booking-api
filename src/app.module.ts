import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { ClinicsModule } from './clinics/clinics.module';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfigModule } from './config/app-config.module';
import { DoctorsModule } from './doctors/doctors.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { UsersModule } from './users/users.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { LoggingModule } from './logging/logging.module';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    LoggingModule,
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    SpecialtiesModule,
    ClinicsModule,
    DoctorsModule,
    AvailabilityModule,
    AppointmentsModule,
    NotificationsModule,
    HealthModule,
    AdminModule,
    RateLimitModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Order matters: identity first, then rate limit (needs the user), then roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
