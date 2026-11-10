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
const CLINIC = { name: 'Central Clinic', addressLine: '1 rue de Rivoli', city: 'Paris' };

describe('catalog images (multipart: data + image)', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const storage = () => s.ctx.app.get<MemoryStorage>(ImageStorage);

  beforeEach(async () => {
    await createAdmin(s.ctx);
    storage().objects.clear();
  });

  const send = (
    method: 'post' | 'patch',
    path: string,
    data?: object | string,
    image?: Buffer,
    as = ADMIN_EMAIL,
  ) => {
    let req = http()[method](path).set(asUser(as));
    if (data !== undefined)
      req = req.field('data', typeof data === 'string' ? data : JSON.stringify(data));
    if (image) req = req.attach('image', image, { filename: 'icon.png', contentType: 'image/png' });
    return req;
  };
  const icon = (id: string) => s.ctx.prisma.specialty.findUniqueOrThrow({ where: { id } });

  it('creates a specialty with data + image, and lists its icon publicly', async () => {
    const res = await send('post', '/specialties', { name: 'Dermatology' }, PNG).expect(201);
    const body = res.body as { id: string; iconUrl: string };
    expect(body.iconUrl).toMatch(/^https:\/\/images\.invalid\/specialtyIcon\//);
    expect(storage().objects.size).toBe(1);
    const list = (await http().get('/specialties')).body as {
      id: string;
      iconUrl: string | null;
    }[];
    expect(list.find((item) => item.id === body.id)?.iconUrl).toBe(body.iconUrl);
  });

  it('creates a specialty without an image, from multipart data or plain JSON', async () => {
    const a = await send('post', '/specialties', { name: 'Neurology' }).expect(201);
    expect((a.body as { iconUrl: unknown }).iconUrl).toBeNull();
    await http()
      .post('/specialties')
      .set(asUser(ADMIN_EMAIL))
      .send({ name: 'Urology' })
      .expect(201);
    expect(storage().objects.size).toBe(0);
  });

  it('replaces the icon with an image-only update and deletes the old one', async () => {
    const created = (await send('post', '/specialties', { name: 'Dermatology' }, PNG).expect(201))
      .body as {
      id: string;
      iconUrl: string;
    };
    const updated = (await send('patch', `/specialties/${created.id}`, undefined, PNG).expect(200))
      .body as {
      iconUrl: string;
    };
    expect(updated.iconUrl).not.toBe(created.iconUrl);
    expect(storage().objects.size).toBe(1);
    expect([...storage().objects.keys()]).toEqual([(await icon(created.id)).iconPublicId]);
  });

  it('removes the icon with removeImage', async () => {
    const created = (await send('post', '/specialties', { name: 'Dermatology' }, PNG).expect(201))
      .body as { id: string };
    await send('patch', `/specialties/${created.id}`, { removeImage: true }).expect(200);
    expect((await icon(created.id)).iconUrl).toBeNull();
    expect(storage().objects.size).toBe(0);
  });

  it('rejects a fake image and creates nothing', async () => {
    const before = await s.ctx.prisma.specialty.count();
    await send(
      'post',
      '/specialties',
      { name: 'Dermatology' },
      Buffer.from('<script>1</script>'),
    ).expect(415);
    expect(await s.ctx.prisma.specialty.count()).toBe(before);
    expect(storage().objects.size).toBe(0);
  });

  it('cleans up the uploaded image when the database write fails', async () => {
    await send('post', '/specialties', { name: 'Dermatology' }).expect(201);
    await send('post', '/specialties', { name: 'Dermatology' }, PNG).expect(409);
    expect(storage().objects.size).toBe(0);
  });

  it('answers 400 for malformed data JSON', async () => {
    await send('post', '/specialties', '{nope').expect(400);
  });

  it('is admin-only', async () => {
    await send('post', '/specialties', { name: 'Dermatology' }, PNG, s.f.patient.email).expect(403);
    expect(storage().objects.size).toBe(0);
  });

  it('creates and updates a clinic with an image', async () => {
    const created = (await send('post', '/clinics', CLINIC, PNG).expect(201)).body as {
      id: string;
      imageUrl: string;
    };
    expect(created.imageUrl).toMatch(/^https:\/\/images\.invalid\/clinicImage\//);
    const updated = (await send('patch', `/clinics/${created.id}`, undefined, PNG).expect(200))
      .body as {
      imageUrl: string;
    };
    expect(updated.imageUrl).not.toBe(created.imageUrl);
    expect(storage().objects.size).toBe(1);
  });

  it('clears a clinic image and keeps the other fields', async () => {
    const created = (await send('post', '/clinics', CLINIC, PNG).expect(201)).body as {
      id: string;
    };
    const res = await send('patch', `/clinics/${created.id}`, {
      removeImage: true,
      city: 'Lyon',
    }).expect(200);
    expect(res.body).toMatchObject({ city: 'Lyon', imageUrl: null });
    expect(storage().objects.size).toBe(0);
  });
});
