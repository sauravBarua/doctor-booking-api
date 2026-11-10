import type { Prisma } from '../generated/prisma/client';

export const doctorSelect = {
  id: true,
  bio: true,
  experienceYears: true,
  slotDurationMin: true,
  user: { select: { name: true, email: true, isActive: true, avatarUrl: true } },
  specialty: { select: { id: true, name: true, slug: true, iconUrl: true } },
  clinic: { select: { id: true, name: true, addressLine: true, city: true, imageUrl: true } },
} satisfies Prisma.DoctorProfileSelect;

export type DoctorRow = Prisma.DoctorProfileGetPayload<{ select: typeof doctorSelect }>;

/** Safe for anonymous visitors: no email, no account state. */
export function toPublicDoctor(row: DoctorRow) {
  return {
    id: row.id,
    name: row.user.name,
    avatarUrl: row.user.avatarUrl,
    bio: row.bio,
    experienceYears: row.experienceYears,
    slotDurationMin: row.slotDurationMin,
    specialty: row.specialty,
    clinic: row.clinic,
  };
}

/** For the doctor themself and for admins. */
export function toPrivateDoctor(row: DoctorRow) {
  return { ...toPublicDoctor(row), email: row.user.email, isActive: row.user.isActive };
}
