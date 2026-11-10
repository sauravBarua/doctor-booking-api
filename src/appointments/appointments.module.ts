import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { JobsModule } from '../jobs/jobs.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AvailabilityModule, JobsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
