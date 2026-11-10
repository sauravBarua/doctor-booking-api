import type { Role } from '../../src/generated/prisma/enums';
import type { TestContext } from './test-app';

export const ADMIN_EMAIL = 'admin@example.com';

export function createUser(ctx: TestContext, email: string, role: Role, label: string) {
  return ctx.prisma.user.create({ data: { email, name: label, role } });
}

export const createAdmin = (ctx: TestContext) => createUser(ctx, ADMIN_EMAIL, 'ADMIN', 'Ad Min');
