import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextDate, parisInstant } from './helpers/dates';
import { createClinic, createDoctor, createSpecialty, createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { asUser, createTestApp, type TestContext } from './helpers/test-app';

describe('Availability (e2e)', () => {
  let ctx: TestContext;
  let doctorId: string;
  const http = () => request(ctx.app.getHttpServer());
  const doctor = asUser('dr@example.com');

  const setMondayMorning = () =>
    http()
      .put('/doctors/me/availability')
      .set(doctor)
      .send({ rules: [{ dayOfWeek: 1, start: '09:00', end: '11:00' }] })
      .expect(200);

  const slotTimes = async (date: string) => {
    const res = await http().get(`/doctors/${doctorId}/slots?from=${date}&to=${date}`).expect(200);
    return (res.body.slots as { time: string }[]).map((slot) => slot.time);
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
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com');
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    const profile = await createDoctor(ctx.prisma, {
      email: 'dr@example.com',
      name: 'Dr Who',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });
    doctorId = profile.id;
  });

  it('lets a doctor set the weekly schedule, replacing the previous one', async () => {
    const first = await http()
      .put('/doctors/me/availability')
      .set(doctor)
      .send({
        rules: [
          { dayOfWeek: 3, start: '14:00', end: '18:00' },
          { dayOfWeek: 1, start: '09:00', end: '12:00' },
        ],
      })
      .expect(200);
    const days = (first.body as { dayOfWeek: number }[]).map((r) => r.dayOfWeek);
    expect(days).toEqual([1, 3]);
    expect(first.body[0]).toMatchObject({ start: '09:00', end: '12:00' });

    await setMondayMorning();
    const current = await http().get('/doctors/me/availability').set(doctor).expect(200);
    expect(current.body).toHaveLength(1);
  });

  it('rejects overlapping or malformed rules', async () => {
    const put = (rules: unknown[]) =>
      http().put('/doctors/me/availability').set(doctor).send({ rules });

    await put([
      { dayOfWeek: 1, start: '09:00', end: '12:00' },
      { dayOfWeek: 1, start: '11:00', end: '14:00' },
    ]).expect(400);
    await put([{ dayOfWeek: 1, start: '12:00', end: '09:00' }]).expect(400);
    await put([{ dayOfWeek: 1, start: '9am', end: '12:00' }]).expect(400);
    await put([{ dayOfWeek: 8, start: '09:00', end: '12:00' }]).expect(400);
  });

  it('publishes bookable slots in Paris time, without authentication', async () => {
    await setMondayMorning();
    const monday = nextDate(1);

    const res = await http()
      .get(`/doctors/${doctorId}/slots?from=${monday}&to=${monday}`)
      .expect(200);
    expect(res.body).toMatchObject({ timezone: 'Europe/Paris', slotDurationMin: 30 });
    const times = (res.body.slots as { time: string }[]).map((s) => s.time);
    expect(times).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(res.body.slots[0].start).toBe(parisInstant(monday, '09:00'));
    expect(res.body.slots[3].end).toBe(parisInstant(monday, '11:00'));
  });

  it('applies partial and whole-day time off, and restores slots when removed', async () => {
    await setMondayMorning();
    const monday = nextDate(1);

    const partial = await http()
      .post('/doctors/me/time-off')
      .set(doctor)
      .send({ date: monday, start: '09:30', end: '10:30', reason: 'Meeting' })
      .expect(201);
    expect(await slotTimes(monday)).toEqual(['09:00', '10:30']);

    const whole = await http()
      .post('/doctors/me/time-off')
      .set(doctor)
      .send({ date: monday })
      .expect(201);
    expect(await slotTimes(monday)).toEqual([]);

    const listed = await http().get('/doctors/me/time-off').set(doctor).expect(200);
    expect(listed.body).toHaveLength(2);

    await http().delete(`/doctors/me/time-off/${partial.body.id}`).set(doctor).expect(204);
    await http().delete(`/doctors/me/time-off/${whole.body.id}`).set(doctor).expect(204);
    expect(await slotTimes(monday)).toHaveLength(4);
  });

  it('validates the slot range and the doctor', async () => {
    await http().get(`/doctors/${doctorId}/slots?from=2026-02-02&to=2026-02-01`).expect(400);
    await http().get(`/doctors/${doctorId}/slots?from=2026-01-01&to=2026-03-01`).expect(400);
    await http().get(`/doctors/${doctorId}/slots?from=2026-13-45`).expect(400);

    await http()
      .patch(`/admin/doctors/${doctorId}`)
      .set(asUser('admin@example.com'))
      .send({ isActive: false })
      .expect(200);
    await http().get(`/doctors/${doctorId}/slots`).expect(404);
  });

  it('rejects time off with a single bound or in the past', async () => {
    const monday = nextDate(1);
    await http()
      .post('/doctors/me/time-off')
      .set(doctor)
      .send({ date: monday, start: '09:00' })
      .expect(400);
    await http().post('/doctors/me/time-off').set(doctor).send({ date: '2020-01-06' }).expect(400);
  });

  it('keeps availability private to doctors and time off private to its owner', async () => {
    await http()
      .put('/doctors/me/availability')
      .set(asUser('pat@example.com'))
      .send({ rules: [] })
      .expect(403);

    const created = await http()
      .post('/doctors/me/time-off')
      .set(doctor)
      .send({ date: nextDate(1) })
      .expect(201);

    const specialty = await ctx.prisma.specialty.findFirstOrThrow();
    const clinic = await ctx.prisma.clinic.findFirstOrThrow();
    await createDoctor(ctx.prisma, {
      email: 'other@example.com',
      name: 'Dr Other',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });
    await http()
      .delete(`/doctors/me/time-off/${created.body.id}`)
      .set(asUser('other@example.com'))
      .expect(404);
  });
});
