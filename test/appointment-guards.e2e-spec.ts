import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isExclusionViolation, isUniqueViolation } from '../src/common/utils/prisma-errors';
import { insertAppointment } from './helpers/booking';
import { createClinic, createDoctor, createSpecialty, createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { createTestApp, type TestContext } from './helpers/test-app';

// Fixed far-future Monday: these tests talk to the database, not to the slot rules.
const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 7, hour, minute));

describe('Appointment guards (e2e)', () => {
  let ctx: TestContext;
  let doctorA: string;
  let doctorB: string;
  let patient1: string;
  let patient2: string;

  const idOf = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  const insert = (o: Parameters<typeof insertAppointment>[1]) => insertAppointment(ctx.prisma, o);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    doctorA = (
      await createDoctor(ctx.prisma, {
        email: 'a@example.com',
        name: 'Dr A',
        specialtyId: specialty.id,
        clinicId: clinic.id,
      })
    ).id;
    doctorB = (
      await createDoctor(ctx.prisma, {
        email: 'b@example.com',
        name: 'Dr B',
        specialtyId: specialty.id,
        clinicId: clinic.id,
      })
    ).id;
    await createUser(ctx.prisma, 'PATIENT', 'p1@example.com');
    await createUser(ctx.prisma, 'PATIENT', 'p2@example.com');
    patient1 = await idOf('p1@example.com');
    patient2 = await idOf('p2@example.com');
  });

  it('has the appointment constraints that migrations are supposed to create', async () => {
    const rows = await ctx.prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'appointments_no_overlap',
        'appointments_patient_no_overlap',
        'appointments_time_valid'
      )`;
    expect(rows.map((row) => row.conname).sort()).toEqual([
      'appointments_no_overlap',
      'appointments_patient_no_overlap',
      'appointments_time_valid',
    ]);
  });

  it('rejects two confirmed appointments overlapping for the same doctor', async () => {
    await insert({ patientId: patient1, doctorId: doctorA, start: at(9) });
    await expect(
      insert({ patientId: patient2, doctorId: doctorA, start: at(9, 15) }),
    ).rejects.toSatisfy(isExclusionViolation);
  });

  it('allows back-to-back appointments (the range is half-open)', async () => {
    await insert({ patientId: patient1, doctorId: doctorA, start: at(9) });
    await expect(
      insert({ patientId: patient2, doctorId: doctorA, start: at(9, 30) }),
    ).resolves.toBeDefined();
  });

  it('allows the same time with a different doctor and a different patient', async () => {
    await insert({ patientId: patient1, doctorId: doctorA, start: at(9) });
    await expect(
      insert({ patientId: patient2, doctorId: doctorB, start: at(9) }),
    ).resolves.toBeDefined();
  });

  it('does not let a cancelled appointment block the slot', async () => {
    const first = await insert({ patientId: patient1, doctorId: doctorA, start: at(9) });
    await ctx.prisma.appointment.update({
      where: { id: first.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(
      insert({ patientId: patient2, doctorId: doctorA, start: at(9) }),
    ).resolves.toBeDefined();
    await expect(
      insert({ patientId: patient1, doctorId: doctorB, start: at(11), status: 'CANCELLED' }),
    ).resolves.toBeDefined();
  });

  it('rejects one patient holding overlapping appointments with different doctors', async () => {
    await insert({ patientId: patient1, doctorId: doctorA, start: at(9) });
    await expect(
      insert({ patientId: patient1, doctorId: doctorB, start: at(9, 15) }),
    ).rejects.toSatisfy(isExclusionViolation);
    await expect(
      insert({ patientId: patient1, doctorId: doctorB, start: at(9, 30) }),
    ).resolves.toBeDefined();
  });

  it('rejects an appointment that ends before it starts', async () => {
    await expect(
      ctx.prisma.appointment.create({
        data: {
          patientId: patient1,
          doctorId: doctorA,
          startAt: at(10),
          endAt: at(9),
          idempotencyKey: 'bad-range-0001',
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps idempotency keys unique per patient only', async () => {
    await insert({ patientId: patient1, doctorId: doctorA, start: at(9), key: 'same-key-0001' });
    await expect(
      insert({ patientId: patient1, doctorId: doctorB, start: at(14), key: 'same-key-0001' }),
    ).rejects.toSatisfy(isUniqueViolation);
    await expect(
      insert({ patientId: patient2, doctorId: doctorB, start: at(14), key: 'same-key-0001' }),
    ).resolves.toBeDefined();
  });
});
