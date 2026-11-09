import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatHm } from '../src/availability/time-utils';
import { bookBody, giveWeekdaySchedule, insertAppointment } from './helpers/booking';
import { nextDate, parisInstant } from './helpers/dates';
import { createClinic, createDoctor, createSpecialty, createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { asUser, createTestApp, type TestContext } from './helpers/test-app';

interface AppointmentBody {
  id: string;
  status: string;
  start: string;
  end: string;
}

describe('Appointments (e2e)', () => {
  let ctx: TestContext;
  let doctorId: string;
  let otherDoctorId: string;
  const http = () => request(ctx.app.getHttpServer());
  const patient = 'pat@example.com';
  const doctor = asUser('dr@example.com');

  const book = (email: string, body: object, key: string = randomUUID()) =>
    http().post('/appointments').set(asUser(email)).set('Idempotency-Key', key).send(body);

  const idOf = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  const makePatients = (count: number) =>
    Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const email = `bulk${index}@example.com`;
        await createUser(ctx.prisma, 'PATIENT', email);
        return email;
      }),
    );

  const slotTimes = async (date: string) => {
    const res = await http().get(`/doctors/${doctorId}/slots?from=${date}&to=${date}`).expect(200);
    return (res.body as { slots: { time: string }[] }).slots.map((slot) => slot.time);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    await createUser(ctx.prisma, 'ADMIN', 'admin@example.com');
    await createUser(ctx.prisma, 'PATIENT', patient);
    await createUser(ctx.prisma, 'PATIENT', 'pat2@example.com');
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    doctorId = (
      await createDoctor(ctx.prisma, {
        email: 'dr@example.com',
        name: 'Dr Who',
        specialtyId: specialty.id,
        clinicId: clinic.id,
      })
    ).id;
    otherDoctorId = (
      await createDoctor(ctx.prisma, {
        email: 'other@example.com',
        name: 'Dr Other',
        specialtyId: specialty.id,
        clinicId: clinic.id,
      })
    ).id;
    await giveWeekdaySchedule(ctx.prisma, doctorId);
    await giveWeekdaySchedule(ctx.prisma, otherDoctorId);
  });

  it('books an offered slot and removes it from the public slots', async () => {
    const date = nextDate(1);
    const res = await book(patient, bookBody(doctorId, date, '09:00', 'Checkup')).expect(201);
    expect(res.body).toMatchObject({
      status: 'CONFIRMED',
      start: parisInstant(date, '09:00'),
      end: parisInstant(date, '09:30'),
      reason: 'Checkup',
      doctor: { name: 'Dr Who' },
    });

    const times = await slotTimes(date);
    expect(times).not.toContain('09:00');
    expect(times).toContain('09:30');
  });

  it('requires an Idempotency-Key and the patient role', async () => {
    const body = bookBody(doctorId, nextDate(1), '09:00');
    await http().post('/appointments').set(asUser(patient)).send(body).expect(400);
    await http()
      .post('/appointments')
      .set(asUser(patient))
      .set('Idempotency-Key', 'short')
      .send(body)
      .expect(400);
    await book('dr@example.com', body).expect(403);
    await http().post('/appointments').set('Idempotency-Key', randomUUID()).send(body).expect(401);
  });

  it('replays an identical request and rejects a reused key with another payload', async () => {
    const date = nextDate(1);
    const key = randomUUID();
    const first = await book(patient, bookBody(doctorId, date, '09:00'), key).expect(201);
    const again = await book(patient, bookBody(doctorId, date, '09:00'), key).expect(200);
    expect((again.body as AppointmentBody).id).toBe((first.body as AppointmentBody).id);
    expect(await ctx.prisma.appointment.count()).toBe(1);

    await book(patient, bookBody(doctorId, date, '09:30'), key).expect(422);
    expect(await ctx.prisma.appointment.count()).toBe(1);
  });

  it('refuses anything that is not an offered slot', async () => {
    const date = nextDate(1);
    await book(patient, bookBody(doctorId, date, '09:07')).expect(409); // not on the grid
    await book(patient, bookBody(doctorId, date, '17:00')).expect(409); // after the last slot
    await book(patient, bookBody(doctorId, nextDate(7), '09:00')).expect(409); // Sunday: no rule
    await book(patient, bookBody(doctorId, nextDate(1, 100), '09:00')).expect(409); // beyond 90 days

    await ctx.prisma.timeOff.create({
      data: {
        doctorId,
        date: new Date(`${date}T00:00:00.000Z`),
        startMinute: 600,
        endMinute: 660,
      },
    });
    await book(patient, bookBody(doctorId, date, '10:00')).expect(409); // time off

    await book(patient, bookBody(randomUUID(), date, '09:00')).expect(404); // unknown doctor
    expect(await ctx.prisma.appointment.count()).toBe(0);
  });

  it('refuses a second patient on the same slot and a patient double-booked across doctors', async () => {
    const date = nextDate(1);
    await book(patient, bookBody(doctorId, date, '09:00')).expect(201);

    await book('pat2@example.com', bookBody(doctorId, date, '09:00')).expect(409);

    const cross = await book(patient, bookBody(otherDoctorId, date, '09:00')).expect(409);
    expect((cross.body as { message: string }).message).toMatch(/already have an appointment/);

    await book(patient, bookBody(otherDoctorId, date, '09:30')).expect(201); // back-to-back is fine
  });

  it('lets exactly one of 50 parallel requests win the same slot', async () => {
    const emails = await makePatients(50);
    const date = nextDate(1);

    const results = await Promise.all(
      emails.map((email) => book(email, bookBody(doctorId, date, '09:00'))),
    );
    const statuses = results.map((result) => result.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(49);
    expect(await ctx.prisma.appointment.count({ where: { doctorId, status: 'CONFIRMED' } })).toBe(
      1,
    );
  });

  it('books adjacent slots in parallel without false conflicts', async () => {
    const emails = await makePatients(10);
    const date = nextDate(1);
    const times = Array.from({ length: 10 }, (_, index) => formatHm(540 + 30 * index));

    const results = await Promise.all(
      emails.map((email, index) => book(email, bookBody(doctorId, date, times[index]))),
    );

    expect(results.map((result) => result.status)).toEqual(Array(10).fill(201));
    expect(await ctx.prisma.appointment.count({ where: { doctorId } })).toBe(10);
  });

  it('collapses parallel retries with the same key into one appointment', async () => {
    const date = nextDate(1);
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => book(patient, bookBody(doctorId, date, '09:00'), key)),
    );
    const statuses = results.map((result) => result.status).sort();

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(9);
    expect(new Set(results.map((result) => (result.body as AppointmentBody).id)).size).toBe(1);
    expect(await ctx.prisma.appointment.count()).toBe(1);
  });

  it('enforces the active appointment limit', async () => {
    const date = nextDate(1);
    const patientId = await idOf(patient);
    const base = new Date(parisInstant(date, '12:00'));
    const created: string[] = [];
    for (let index = 0; index < 5; index++) {
      const row = await insertAppointment(ctx.prisma, {
        patientId,
        doctorId,
        start: new Date(base.getTime() + index * 30 * 60_000),
      });
      created.push(row.id);
    }

    const refused = await book(patient, bookBody(doctorId, date, '09:00')).expect(409);
    expect((refused.body as { message: string }).message).toMatch(/upcoming appointments/);

    await http()
      .post(`/appointments/${created[0]}/cancel`)
      .set(asUser(patient))
      .send({})
      .expect(200);
    await book(patient, bookBody(doctorId, date, '09:00')).expect(201);
  });

  it('frees the slot when the patient cancels, and refuses a second cancel', async () => {
    const date = nextDate(1);
    const created = await book(patient, bookBody(doctorId, date, '09:00')).expect(201);
    const { id } = created.body as AppointmentBody;

    const cancelled = await http()
      .post(`/appointments/${id}/cancel`)
      .set(asUser(patient))
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledByRole: 'PATIENT' });

    expect(await slotTimes(date)).toContain('09:00');
    await book('pat2@example.com', bookBody(doctorId, date, '09:00')).expect(201);

    await http().post(`/appointments/${id}/cancel`).set(asUser(patient)).send({}).expect(409);
  });

  it('applies the 24 hour cutoff to patients but not to doctors', async () => {
    const patientId = await idOf(patient);
    const soon = await insertAppointment(ctx.prisma, {
      patientId,
      doctorId,
      start: new Date(Date.now() + 3 * 3_600_000),
    });

    await http().post(`/appointments/${soon.id}/cancel`).set(asUser(patient)).send({}).expect(409);

    const res = await http()
      .post(`/appointments/${soon.id}/cancel`)
      .set(doctor)
      .send({ reason: 'Emergency' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      cancelledByRole: 'DOCTOR',
      cancellationReason: 'Emergency',
    });
  });

  it('lets the doctor complete or mark no-show only after the start', async () => {
    const patientId = await idOf(patient);
    const hours = (count: number) => new Date(Date.now() + count * 3_600_000);
    const done = await insertAppointment(ctx.prisma, { patientId, doctorId, start: hours(-5) });
    const missed = await insertAppointment(ctx.prisma, { patientId, doctorId, start: hours(-3) });
    const future = await insertAppointment(ctx.prisma, { patientId, doctorId, start: hours(30) });

    const completed = await http()
      .post(`/appointments/${done.id}/complete`)
      .set(doctor)
      .expect(200);
    expect(completed.body).toMatchObject({ status: 'COMPLETED' });
    const noShow = await http().post(`/appointments/${missed.id}/no-show`).set(doctor).expect(200);
    expect(noShow.body).toMatchObject({ status: 'NO_SHOW' });

    await http().post(`/appointments/${done.id}/complete`).set(doctor).expect(409);
    await http().post(`/appointments/${done.id}/cancel`).set(doctor).send({}).expect(409);
    await http().post(`/appointments/${future.id}/complete`).set(doctor).expect(409);
    await http().post(`/appointments/${future.id}/complete`).set(asUser(patient)).expect(403);
  });

  it('hides appointments from non-participants and scopes the lists', async () => {
    const created = await book(patient, bookBody(doctorId, nextDate(1), '09:00')).expect(201);
    const { id } = created.body as AppointmentBody;
    const get = (email: string) => http().get(`/appointments/${id}`).set(asUser(email));

    await get(patient).expect(200);
    await get('dr@example.com').expect(200);
    await get('admin@example.com').expect(200);
    await get('pat2@example.com').expect(404);
    await get('other@example.com').expect(404);
    await http()
      .post(`/appointments/${id}/cancel`)
      .set(asUser('pat2@example.com'))
      .send({})
      .expect(404);

    const count = async (email: string) => {
      const res = await http().get('/appointments').set(asUser(email)).expect(200);
      return (res.body as { items: unknown[] }).items.length;
    };
    expect(await count(patient)).toBe(1);
    expect(await count('dr@example.com')).toBe(1);
    expect(await count('pat2@example.com')).toBe(0);
    expect(await count('other@example.com')).toBe(0);
  });

  it('paginates and filters the list', async () => {
    const date = nextDate(1);
    for (const time of ['10:00', '09:00', '09:30']) {
      await book(patient, bookBody(doctorId, date, time)).expect(201);
    }

    type Page = { items: { start: string }[]; nextCursor: string | null };
    const first = (await http().get('/appointments?limit=2').set(asUser(patient)).expect(200))
      .body as Page;
    expect(first.items.map((item) => item.start)).toEqual([
      parisInstant(date, '09:00'),
      parisInstant(date, '09:30'),
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = (
      await http()
        .get(`/appointments?limit=2&cursor=${first.nextCursor}`)
        .set(asUser(patient))
        .expect(200)
    ).body as Page;
    expect(second.items.map((item) => item.start)).toEqual([parisInstant(date, '10:00')]);
    expect(second.nextCursor).toBeNull();

    const cancelled = (
      await http().get('/appointments?status=CANCELLED').set(asUser(patient)).expect(200)
    ).body as Page;
    expect(cancelled.items).toHaveLength(0);
  });
});
