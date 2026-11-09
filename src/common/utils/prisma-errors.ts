import { inspect } from 'node:util';

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export const isUniqueViolation = (error: unknown): boolean => hasCode(error, 'P2002');
export const isRecordNotFound = (error: unknown): boolean => hasCode(error, 'P2025');
export const isForeignKeyViolation = (error: unknown): boolean => hasCode(error, 'P2003');

/** Postgres 23P01. With driver adapters the code sits deep in the error, so inspect it whole. */
export function isExclusionViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const text = inspect(error, { depth: 8 });
  return text.includes('23P01') || /exclusion constraint/i.test(text);
}
