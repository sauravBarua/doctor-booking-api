import { v2 as cloudinary } from 'cloudinary';
import { IMAGE_KINDS, type ImageKind } from './image-kinds';
import { ImageStorage, type StoredImage, type UploadableImage } from './image-storage';

export class CloudinaryStorage extends ImageStorage {
  constructor(settings: { cloudName: string; apiKey: string; apiSecret: string }) {
    super();
    cloudinary.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
    });
  }

  upload(image: UploadableImage, kind: ImageKind): Promise<StoredImage> {
    const spec = IMAGE_KINDS[kind];
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `doctor-booking/${spec.folder}`,
          resource_type: 'image',
          overwrite: false,
          allowed_formats: ['jpg', 'png', 'webp', 'avif'],
          transformation: [
            {
              width: spec.width,
              height: spec.height,
              crop: spec.crop,
              ...(spec.crop === 'fill' ? { gravity: 'auto' } : {}),
            },
          ],
        },
        (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Cloudinary upload failed'));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(image.buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  }
}
