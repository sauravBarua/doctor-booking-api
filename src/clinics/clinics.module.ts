import { Module } from '@nestjs/common';
import { ImagesModule } from '../uploads/images.module';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({ imports: [ImagesModule], controllers: [ClinicsController], providers: [ClinicsService] })
export class ClinicsModule {}
