import type { ImageKind } from './image-kinds';

export interface UploadableImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredImage {
  url: string;
  /** Needed to delete the asset later. */
  publicId: string;
}

export abstract class ImageStorage {
  abstract upload(image: UploadableImage, kind: ImageKind): Promise<StoredImage>;
  abstract delete(publicId: string): Promise<void>;
}
