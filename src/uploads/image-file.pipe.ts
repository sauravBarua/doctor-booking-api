import {
  BadRequestException,
  Injectable,
  type PipeTransform,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { detectImageType, type ImageMimeType } from './image-type';

/** The subset of multer's file object that we use (avoids a dependency on global types). */
export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
}

export interface ValidatedImage {
  buffer: Buffer;
  mimetype: ImageMimeType;
  size: number;
}

export function validateImage(file: UploadedFileLike): ValidatedImage {
  const mimetype = detectImageType(file.buffer);
  if (!mimetype)
    throw new UnsupportedMediaTypeException('Only JPEG, PNG, WebP or AVIF images are accepted');
  return { buffer: file.buffer, mimetype, size: file.size };
}

@Injectable()
export class RequiredImagePipe implements PipeTransform<
  UploadedFileLike | undefined,
  ValidatedImage
> {
  transform(file: UploadedFileLike | undefined): ValidatedImage {
    if (!file) throw new BadRequestException('Field "image" is required');
    return validateImage(file);
  }
}

/** For endpoints where the image is optional (e.g. create with `data` + optional `image`). */
@Injectable()
export class OptionalImagePipe implements PipeTransform<
  UploadedFileLike | undefined,
  ValidatedImage | undefined
> {
  transform(file: UploadedFileLike | undefined): ValidatedImage | undefined {
    return file ? validateImage(file) : undefined;
  }
}
