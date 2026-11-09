function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export const isUniqueViolation = (error: unknown): boolean => hasCode(error, 'P2002');
export const isRecordNotFound = (error: unknown): boolean => hasCode(error, 'P2025');
export const isForeignKeyViolation = (error: unknown): boolean => hasCode(error, 'P2003');
