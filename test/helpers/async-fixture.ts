import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { APP_TIMEZONE } from '../../src/common/constants';
import { EmailJobHandler } from '../../src/jobs/email-job.handler';
import { bookBody, giveWeekdaySchedule } from './booking';
import { createClinic, createDoctor, createSpecialty, createUser } from './factories';
import { resetDatabase } from './reset-db';
import { asUser, createTestApp, type TestContext } from './test-app';

export interface Fixture {
  patient: { id: string; email: string };
  doctor: { id: string; userId: string; email: string };
}

export async function createFixture(ctx: TestContext): Promise<Fixture> {
  const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
  const clinic = await createClinic(ctx.prisma);
  const doctor = await createDoctor(ctx.prisma, {
    email: 'dr@example.com',
    name: 'Dr Who',
    specialtyId: specialty.id,
    clinicId: clinic.id,
  });
  const patient = await createUser(ctx.prisma, 'PATIENT', 'pat@example.com', 'Pat Ient');
  await giveWeekdaySchedule(ctx.prisma, doctor.id);
  return {
    patient: { id: patient.id, email: patient.email },
    doctor: { id: doctor.id, userId: doctor.userId, email: 'dr@example.com' },
  };
}

/** Books through the real API (so the outbox row is written by the real transaction). */
export async function bookAppointment(
  ctx: TestContext,
  f: Fixture,
  daysAhead = 8,
  hour = 10,
): Promise<string> {
  let day = DateTime.now().setZone(APP_TIMEZONE).startOf('day').plus({ days: daysAhead });
  while (day.weekday > 5) day = day.plus({ days: 1 });
  const date = day.toISODate() ?? '';
  const time = `${String(hour).padStart(2, '0')}:00`;
  const res = await request(ctx.app.getHttpServer())
    .post('/appointments')
    .set(asUser(f.patient.email))
    .set('Idempotency-Key', randomUUID())
    .send(bookBody(f.doctor.id, date, time));
  if (res.status !== 201) {
    throw new Error(`booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { id: string }).id;
}

export async function cancelAppointment(ctx: TestContext, f: Fixture, id: string): Promise<void> {
  const res = await request(ctx.app.getHttpServer())
    .post(`/appointments/${id}/cancel`)
    .set(asUser(f.patient.email))
    .send({});
  if (res.status !== 200) {
    throw new Error(`cancel failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/** Direct insert for reminder timing tests (bypasses booking rules on purpose). */
export async function insertConfirmed(
  ctx: TestContext,
  f: Fixture,
  startAt: Date,
  createdAt: Date,
): Promise<string> {
  const row = await ctx.prisma.appointment.create({
    data: {
      patientId: f.patient.id,
      doctorId: f.doctor.id,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: 'CONFIRMED',
      reason: 'Consultation',
      idempotencyKey: randomUUID(),
      createdAt,
    },
  });
  return row.id;
}

/** Registers the lifecycle hooks and returns a state object filled in by them. */
export function useAsyncFixture() {
  const state = {} as { ctx: TestContext; f: Fixture };
  beforeAll(async () => {
    state.ctx = await createTestApp();
  });
  afterAll(async () => {
    await state.ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(state.ctx.prisma, state.ctx.redis);
    state.ctx.mail.clear();
    state.ctx.queue.clear();
    state.ctx.queue.handler = state.ctx.app.get(EmailJobHandler, { strict: false });
    state.f = await createFixture(state.ctx);
  });
  return state;
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
