import type { Prisma } from '../generated/prisma/client';

export const adminUserSelect = {
  id: true,
  email: true,
  name: true, // ← ADJUST if your User uses other name fields
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  googleId: true,
  passwordHash: true, // only used to derive hasPassword, never returned
  createdAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export function toAdminUserView(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.isActive,
    emailVerifiedAt: row.emailVerifiedAt,
    hasPassword: row.passwordHash !== null,
    hasGoogle: row.googleId !== null,
    createdAt: row.createdAt,
  };
}
