import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

const DEV_PASSWORD = 'Password123!';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed dev credentials in production');
  }

  const user = (email: string, name: string, role: 'ADMIN' | 'DOCTOR' | 'PATIENT') =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role } });

  await user('admin@example.com', 'Admin', 'ADMIN');
  await user('pat.ient@example.com', 'Pat Ient', 'PATIENT');
  await user('jane.doe@example.com', 'Jane Doe', 'PATIENT');
  const house = await user('gregory.house@example.com', 'Gregory House', 'DOCTOR');

  const specialty = (name: string, slug: string) =>
    prisma.specialty.upsert({ where: { slug }, update: {}, create: { name, slug } });

  const cardiology = await specialty('Cardiology', 'cardiology');
  await specialty('Dermatology', 'dermatology');
  await specialty('General Medicine', 'general-medicine');

  const clinic =
    (await prisma.clinic.findFirst({ where: { name: 'Central Clinic', city: 'Paris' } })) ??
    (await prisma.clinic.create({
      data: { name: 'Central Clinic', addressLine: '12 Rue de Rivoli', city: 'Paris' },
    }));

  const profile = await prisma.doctorProfile.upsert({
    where: { userId: house.id },
    update: {},
    create: {
      userId: house.id,
      specialtyId: cardiology.id,
      clinicId: clinic.id,
      bio: 'Diagnostician.',
      experienceYears: 20,
    },
  });

  const existingRules = await prisma.availabilityRule.count({ where: { doctorId: profile.id } });
  if (existingRules === 0) {
    await prisma.availabilityRule.createMany({
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        doctorId: profile.id,
        dayOfWeek,
        startMinute: 540, // 09:00
        endMinute: 1020, // 17:00
      })),
    });
  }

  for (let i = 1; i <= 10; i++) {
    await prisma.user.upsert({
      where: { email: `race${i}@example.com` },
      update: {},
      create: { email: `race${i}@example.com`, name: `Race Patient ${i}`, role: 'PATIENT' },
    });
  }

  // Dev-only: every seeded account can sign in with a password.
  const passwordHash = await hash(DEV_PASSWORD, 10);
  const raceEmails = Array.from({ length: 10 }, (_, index) => `race${index + 1}@example.com`);
  await prisma.user.updateMany({
    where: {
      email: {
        in: [
          'admin@example.com',
          'pat.ient@example.com',
          'jane.doe@example.com',
          'gregory.house@example.com',
          ...raceEmails,
        ],
      },
    },
    data: { passwordHash, emailVerifiedAt: new Date() },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
