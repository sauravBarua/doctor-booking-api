export const IMAGE_KINDS = {
  avatar: { folder: 'avatars', width: 512, height: 512, crop: 'fill' },
  specialtyIcon: { folder: 'specialties', width: 256, height: 256, crop: 'fit' },
  clinicImage: { folder: 'clinics', width: 1280, height: 720, crop: 'limit' },
} as const;

export type ImageKind = keyof typeof IMAGE_KINDS;
