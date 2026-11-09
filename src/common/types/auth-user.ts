import type { Role } from '../../generated/prisma/enums';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
