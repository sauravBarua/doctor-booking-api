import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ImageLifecycle } from './image-lifecycle';

@Module({
  imports: [StorageModule],
  providers: [ImageLifecycle],
  exports: [StorageModule, ImageLifecycle],
})
export class ImagesModule {}
