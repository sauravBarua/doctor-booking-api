import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorage } from './cloudinary-storage';
import { ImageStorage } from './image-storage';
import { MemoryStorage } from './memory-storage';

@Module({
  providers: [
    {
      provide: ImageStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ImageStorage =>
        config.getOrThrow<string>('STORAGE_DRIVER') === 'cloudinary'
          ? new CloudinaryStorage({
              cloudName: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
              apiKey: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
              apiSecret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
            })
          : new MemoryStorage(),
    },
  ],
  exports: [ImageStorage],
})
export class StorageModule {}
