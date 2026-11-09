import { describe, expect, it } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('General Medicine')).toBe('general-medicine');
  });

  it('strips accents', () => {
    expect(slugify('Médecine générale')).toBe('medecine-generale');
  });

  it('collapses punctuation', () => {
    expect(slugify('Ear, Nose & Throat')).toBe('ear-nose-throat');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify(' -- !! ')).toBe('');
  });
});
