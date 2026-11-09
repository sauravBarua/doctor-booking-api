import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { ClinicsModule } from './clinics/clinics.module';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfigModule } from './config/app-config.module';
import { DevAuthGuard } from './dev/dev-auth.guard';
import { DoctorsModule } from './doctors/doctors.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { UsersModule } from './users/users.module';
import { AvailabilityModule } from './availability/availability.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    UsersModule,
    SpecialtiesModule,
    ClinicsModule,
    DoctorsModule,
    AvailabilityModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Order matters: identity first, then roles.
    { provide: APP_GUARD, useClass: DevAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
