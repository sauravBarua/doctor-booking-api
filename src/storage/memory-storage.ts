import { randomUUID } from 'node:crypto';
import type { ImageKind } from './image-kinds';
import { ImageStorage, type StoredImage, type UploadableImage } from './image-storage';

export class MemoryStorage extends ImageStorage {
  readonly objects = new Map<string, { kind: ImageKind; size: number; mimetype: string }>();

  upload(image: UploadableImage, kind: ImageKind): Promise<StoredImage> {
    const publicId = `${kind}/${randomUUID()}`;
    this.objects.set(publicId, { kind, size: image.size, mimetype: image.mimetype });
    return Promise.resolve({ url: `https://images.invalid/${publicId}`, publicId });
  }

  delete(publicId: string): Promise<void> {
    this.objects.delete(publicId);
    return Promise.resolve();
  }
}
