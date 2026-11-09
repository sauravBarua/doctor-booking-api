import type { Role } from '../../src/generated/prisma/enums';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { slugify } from '../../src/common/utils/slugify';

export const createUser = (
  prisma: PrismaService,
  role: Role,
  email: string,
  name: string = email.split('@')[0],
) => prisma.user.create({ data: { email, name, role } });

export const createSpecialty = (prisma: PrismaService, name: string) =>
  prisma.specialty.create({ data: { name, slug: slugify(name) } });

export const createClinic = (prisma: PrismaService, name = 'Central Clinic') =>
  prisma.clinic.create({ data: { name, addressLine: '12 Rue de Rivoli', city: 'Paris' } });

export async function createDoctor(
  prisma: PrismaService,
  input: { email: string; name: string; specialtyId: string; clinicId: string },
) {
  const user = await createUser(prisma, 'DOCTOR', input.email, input.name);
  return prisma.doctorProfile.create({
    data: { userId: user.id, specialtyId: input.specialtyId, clinicId: input.clinicId },
  });
}
