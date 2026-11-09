import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClinic, createDoctor, createSpecialty, createUser } from './helpers/factories';
import { resetDatabase } from './helpers/reset-db';
import { asUser, createTestApp, type TestContext } from './helpers/test-app';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Catalog (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const admin = asUser('admin@example.com');

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, ctx.redis);
    await createUser(ctx.prisma, 'ADMIN', 'admin@example.com');
  });

  it('lets an admin manage specialties and clinics, and anyone read them', async () => {
    const specialty = await http()
      .post('/specialties')
      .set(admin)
      .send({ name: 'Médecine générale' })
      .expect(201);
    expect(specialty.body.slug).toBe('medecine-generale');

    await http()
      .patch(`/specialties/${specialty.body.id}`)
      .set(admin)
      .send({ description: 'GP' })
      .expect(200);
    const clinic = await http()
      .post('/clinics')
      .set(admin)
      .send({ name: 'Central Clinic', addressLine: '12 Rue de Rivoli', city: 'Paris' })
      .expect(201);

    const specialties = await http().get('/specialties').expect(200);
    expect(specialties.body).toHaveLength(1);
    await http().get(`/clinics/${clinic.body.id}`).expect(200);
  });

  it('rejects duplicate specialties and non-admin writes', async () => {
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com');
    await http().post('/specialties').set(admin).send({ name: 'Cardiology' }).expect(201);
    await http().post('/specialties').set(admin).send({ name: 'Cardiology' }).expect(409);
    await http()
      .post('/clinics')
      .set(asUser('pat@example.com'))
      .send({ name: 'X Clinic', addressLine: '1 Rue X', city: 'Paris' })
      .expect(403);
  });

  it('creates a doctor end to end without leaking private data publicly', async () => {
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);

    const created = await http()
      .post('/admin/doctors')
      .set(admin)
      .send({
        email: 'House@Example.com',
        name: 'Gregory House',
        specialtyId: specialty.id,
        clinicId: clinic.id,
        bio: 'Diagnostician',
        experienceYears: 20,
      })
      .expect(201);
    expect(created.body).toMatchObject({ email: 'house@example.com', slotDurationMin: 30 });

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'house@example.com' } });
    expect(user.role).toBe('DOCTOR');

    const list = await http().get('/doctors').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe('Gregory House');
    expect(list.body.items[0]).not.toHaveProperty('email');
    expect(list.body.items[0].specialty.name).toBe('Cardiology');
  });

  it('rejects a doctor with a used email or an unknown specialty', async () => {
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    const body = {
      email: 'dup@example.com',
      name: 'Dr Dup',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    };

    await http().post('/admin/doctors').set(admin).send(body).expect(201);
    await http().post('/admin/doctors').set(admin).send(body).expect(409);
    await http()
      .post('/admin/doctors')
      .set(admin)
      .send({ ...body, email: 'other@example.com', specialtyId: UNKNOWN_ID })
      .expect(400);
  });

  it('searches by specialty, clinic and name, with cursor pages', async () => {
    const cardio = await createSpecialty(ctx.prisma, 'Cardiology');
    const derm = await createSpecialty(ctx.prisma, 'Dermatology');
    const clinicA = await createClinic(ctx.prisma, 'Clinic A');
    const clinicB = await createClinic(ctx.prisma, 'Clinic B');
    await createDoctor(ctx.prisma, {
      email: 'a@e.com',
      name: 'Alice Martin',
      specialtyId: cardio.id,
      clinicId: clinicA.id,
    });
    await createDoctor(ctx.prisma, {
      email: 'b@e.com',
      name: 'Bob Durand',
      specialtyId: derm.id,
      clinicId: clinicA.id,
    });
    await createDoctor(ctx.prisma, {
      email: 'c@e.com',
      name: 'Carol Petit',
      specialtyId: cardio.id,
      clinicId: clinicB.id,
    });

    const names = (body: { items: { name: string }[] }) => body.items.map((d) => d.name).sort();

    const bySpecialty = await http().get(`/doctors?specialtyId=${cardio.id}`).expect(200);
    expect(names(bySpecialty.body)).toEqual(['Alice Martin', 'Carol Petit']);

    const byClinic = await http().get(`/doctors?clinicId=${clinicB.id}`).expect(200);
    expect(names(byClinic.body)).toEqual(['Carol Petit']);

    const byName = await http().get('/doctors?q=bo').expect(200);
    expect(names(byName.body)).toEqual(['Bob Durand']);

    const first = await http().get('/doctors?limit=2').expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await http().get(`/doctors?limit=2&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('hides deactivated doctors and locks them out', async () => {
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    const doctor = await createDoctor(ctx.prisma, {
      email: 'd@e.com',
      name: 'Dr Gone',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });

    await http()
      .patch(`/admin/doctors/${doctor.id}`)
      .set(admin)
      .send({ isActive: false })
      .expect(200);

    await http().get(`/doctors/${doctor.id}`).expect(404);
    expect((await http().get('/doctors').expect(200)).body.items).toHaveLength(0);
    await http().get('/me').set(asUser('d@e.com')).expect(401);
  });

  it('lets a doctor read and edit their own profile, but nobody else', async () => {
    const specialty = await createSpecialty(ctx.prisma, 'Cardiology');
    const clinic = await createClinic(ctx.prisma);
    const doctor = await createDoctor(ctx.prisma, {
      email: 'd@e.com',
      name: 'Dr Who',
      specialtyId: specialty.id,
      clinicId: clinic.id,
    });
    await createUser(ctx.prisma, 'PATIENT', 'pat@example.com');

    const mine = await http().get('/doctors/me').set(asUser('d@e.com')).expect(200);
    expect(mine.body.email).toBe('d@e.com');

    const updated = await http()
      .patch('/doctors/me')
      .set(asUser('d@e.com'))
      .send({ bio: 'New bio' })
      .expect(200);
    expect(updated.body.bio).toBe('New bio');

    await http().get('/doctors/me').set(asUser('pat@example.com')).expect(403);
    await http()
      .patch(`/admin/doctors/${doctor.id}`)
      .set(asUser('pat@example.com'))
      .send({ bio: 'x' })
      .expect(403);
  });
});
