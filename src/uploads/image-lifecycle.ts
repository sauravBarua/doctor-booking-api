import { Injectable, Logger } from '@nestjs/common';
import type { ImageKind } from '../storage/image-kinds';
import { ImageStorage, type StoredImage } from '../storage/image-storage';
import type { ValidatedImage } from './image-file.pipe';

@Injectable()
export class ImageLifecycle {
  private readonly logger = new Logger(ImageLifecycle.name);

  constructor(private readonly storage: ImageStorage) {}

  /** Uploads before the database write. Undefined when there is nothing to upload. */
  stage(image: ValidatedImage | undefined, kind: ImageKind): Promise<StoredImage | undefined> {
    return image ? this.storage.upload(image, kind) : Promise.resolve(undefined);
  }

  /** The database write failed: remove the asset we just uploaded. */
  async abandon(staged: StoredImage | undefined): Promise<void> {
    if (staged) await this.discard(staged.publicId);
  }

  /** The database write succeeded: remove the asset that was replaced or cleared. */
  async release(publicId: string | null | undefined): Promise<void> {
    if (publicId) await this.discard(publicId);
  }

  private async discard(publicId: string): Promise<void> {
    try {
      await this.storage.delete(publicId);
    } catch (error) {
      this.logger.warn(
        `could not delete image ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
