export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isAvif(bytes: Buffer): boolean {
  if (bytes.length < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp') return false;
  const boxEnd = Math.min(bytes.readUInt32BE(0), bytes.length, 64);
  const brands = [bytes.toString('ascii', 8, 12)];
  for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(bytes.toString('ascii', i, i + 4));
  return brands.includes('avif') || brands.includes('avis');
}

export function detectImageType(bytes: Buffer): ImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (isAvif(bytes)) return 'image/avif';
  return null;
}
