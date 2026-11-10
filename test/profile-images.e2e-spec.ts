import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImageStorage } from '../src/storage/image-storage';
import type { MemoryStorage } from '../src/storage/memory-storage';
import { ADMIN_EMAIL, createAdmin } from './helpers/admin-fixture';
import { useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('profile images (PATCH /me and PATCH /doctors/me)', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const storage = () => s.ctx.app.get<MemoryStorage>(ImageStorage);

  beforeEach(async () => {
    await createAdmin(s.ctx);
    storage().objects.clear();
  });

  const patch = (path: string, as: string, data?: object, image?: Buffer) => {
    let req = http().patch(path).set(asUser(as));
    if (data) req = req.field('data', JSON.stringify(data));
    if (image) req = req.attach('image', image, { filename: 'me.png', contentType: 'image/png' });
    return req;
  };

  it('a patient updates their name and avatar together, and GET /me shows it', async () => {
    const res = await patch('/me', s.f.patient.email, { name: 'Pat Renamed' }, PNG).expect(200);
    expect(res.body).toMatchObject({ name: 'Pat Renamed' });
    const me = (await http().get('/me').set(asUser(s.f.patient.email))).body as {
      avatarUrl: string;
    };
    expect(me.avatarUrl).toMatch(/^https:\/\/images\.invalid\/avatar\//);
    expect(storage().objects.size).toBe(1);
  });

  it('replaces then removes the avatar without leaving assets behind', async () => {
    await patch('/me', s.f.patient.email, undefined, PNG).expect(200);
    await patch('/me', s.f.patient.email, undefined, PNG).expect(200);
    expect(storage().objects.size).toBe(1);
    await patch('/me', s.f.patient.email, { removeImage: true }).expect(200);
    expect(storage().objects.size).toBe(0);
    const row = await s.ctx.prisma.user.findUniqueOrThrow({ where: { id: s.f.patient.id } });
    expect(row.avatarUrl).toBeNull();
  });

  it('rejects an empty update', async () => {
    await patch('/me', s.f.patient.email).expect(400);
  });

  it('admins use PATCH /me too; doctors are pointed to their own endpoint', async () => {
    await patch('/me', ADMIN_EMAIL, undefined, PNG).expect(200);
    await patch('/me', s.f.doctor.email, { name: 'Dr Renamed' }).expect(403);
  });

  it('a doctor updates bio and avatar, visible on the public profile', async () => {
    const res = await patch('/doctors/me', s.f.doctor.email, { bio: 'Cardiologist' }, PNG).expect(
      200,
    );
    expect(res.body).toMatchObject({ bio: 'Cardiologist' });
    const pub = (await http().get(`/doctors/${s.f.doctor.id}`)).body as { avatarUrl: string };
    expect(pub.avatarUrl).toMatch(/^https:\/\/images\.invalid\/avatar\//);
  });

  it('a doctor replacing their avatar deletes the previous one', async () => {
    await patch('/doctors/me', s.f.doctor.email, undefined, PNG).expect(200);
    await patch('/doctors/me', s.f.doctor.email, undefined, PNG).expect(200);
    expect(storage().objects.size).toBe(1);
  });
});
