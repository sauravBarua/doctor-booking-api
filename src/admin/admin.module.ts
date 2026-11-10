import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { AdminAppointmentsService } from './admin-appointments.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuditModule, JobsModule],
  controllers: [AdminController],
  providers: [AdminUsersService, AdminAppointmentsService, AdminStatsService],
})
export class AdminModule {}
