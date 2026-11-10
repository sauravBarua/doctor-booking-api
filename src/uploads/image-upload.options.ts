import { MAX_IMAGE_BYTES } from '../common/constants';

/** Memory storage (multer default). Oversized files answer 413. */
export const imageUploadOptions = {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5, fieldSize: 100_000 },
};
