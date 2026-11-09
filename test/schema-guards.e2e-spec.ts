import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isExclusionViolation } from '../src/common/utils/prisma-errors';
import { createClinic, createDoctor, createSpecialty } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { createTestApp, type TestContext } from './helpers/test-app';

describe('Schema guards (e2e)', () => {
  let ctx: TestContext;
  let doctorId: string;

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
    const doctor = await createDoctor(ctx.prisma, {
      email: 'dr@example.com',
      name: 'Dr Who',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });
    doctorId = doctor.id;
  });

  const rule = (day: number, startMinute: number, endMinute: number) =>
    ctx.prisma.availabilityRule.create({
      data: { doctorId, dayOfWeek: day, startMinute, endMinute },
    });

  it('has the availability constraints that migrations are supposed to create', async () => {
    const rows = await ctx.prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'availability_rules_no_overlap',
        'availability_rules_minutes_valid',
        'availability_rules_day_valid',
        'time_off_minutes_valid'
      )`;
    expect(rows.map((row) => row.conname).sort()).toEqual([
      'availability_rules_day_valid',
      'availability_rules_minutes_valid',
      'availability_rules_no_overlap',
      'time_off_minutes_valid',
    ]);
  });

  it('rejects overlapping rules for the same doctor and day', async () => {
    await rule(1, 540, 720);
    await expect(rule(1, 660, 780)).rejects.toSatisfy(isExclusionViolation);
  });

  it('allows adjacent rules (end = next start)', async () => {
    await rule(1, 540, 720);
    await expect(rule(1, 720, 780)).resolves.toBeDefined();
  });

  it('allows the same hours on a different day', async () => {
    await rule(1, 540, 720);
    await expect(rule(2, 540, 720)).resolves.toBeDefined();
  });

  it('rejects invalid minute ranges', async () => {
    await expect(rule(1, 700, 600)).rejects.toThrow();
    await expect(rule(1, 0, 1441)).rejects.toThrow();
  });
});
