import { Module } from '@nestjs/common';
import { ImagesModule } from '../uploads/images.module';
import { AdminDoctorsController } from './admin-doctors.controller';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [ImagesModule],
  controllers: [DoctorsController, AdminDoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
