import { BadRequestException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { detectImageType } from './image-type';
import { parseDataField } from './multipart-json';

const PNG = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46', 'hex');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(WEBP)).toBe('image/webp');
  });

  it('rejects text, SVG and truncated input', () => {
    expect(detectImageType(Buffer.from('hello world, definitely not an image'))).toBeNull();
    expect(
      detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  const avif = (major: string, compatible: string[]) =>
    Buffer.concat([
      Buffer.from([0, 0, 0, 16 + compatible.length * 4]),
      Buffer.from('ftyp'),
      Buffer.from(major),
      Buffer.from([0, 0, 0, 0]),
      ...compatible.map((brand) => Buffer.from(brand)),
    ]);

  it('recognises AVIF by its major or compatible brand', () => {
    expect(detectImageType(avif('avif', ['mif1']))).toBe('image/avif');
    expect(detectImageType(avif('mif1', ['miaf', 'avif']))).toBe('image/avif');
  });

  it('does not accept HEIC', () => {
    expect(detectImageType(avif('heic', ['mif1', 'heic']))).toBeNull();
  });
});

describe('parseDataField', () => {
  const schema = z.object({ name: z.string().min(2) });

  it('returns the parsed value', () => {
    expect(parseDataField(schema, '{"name":"Cardiology"}')).toEqual({ name: 'Cardiology' });
  });

  it('answers 400 for missing or malformed JSON', () => {
    expect(() => parseDataField(schema, undefined)).toThrow(BadRequestException);
    expect(() => parseDataField(schema, '{nope')).toThrow(BadRequestException);
  });

  it('answers a validation error when the schema does not match', () => {
    expect(() => parseDataField(schema, '{"name":"x"}')).toThrow(ZodValidationException);
  });
});
