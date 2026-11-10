import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';

@Module({
  imports: [StorageModule],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [StorageModule],
})
export class UploadsModule {}
