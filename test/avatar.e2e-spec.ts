import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from '../src/common/constants';
import { ImageStorage } from '../src/storage/image-storage';
import type { MemoryStorage } from '../src/storage/memory-storage';
import { useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('avatar upload', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const storage = () => s.ctx.app.get<MemoryStorage>(ImageStorage);
  const patient = () => asUser(s.f.patient.email);
  const put = (file: Buffer, contentType = 'image/png') =>
    http()
      .put('/me/avatar')
      .set(patient())
      .attach('image', file, { filename: 'a.png', contentType });
  const row = () => s.ctx.prisma.user.findUniqueOrThrow({ where: { id: s.f.patient.id } });

  beforeEach(() => {
    storage().objects.clear();
  });

  it('stores a PNG avatar and returns its URL', async () => {
    const res = await put(PNG_1X1).expect(200);
    const { avatarUrl } = res.body as { avatarUrl: string };
    expect(avatarUrl).toMatch(/^https:\/\/images\.invalid\/avatar\//);
    expect((await row()).avatarUrl).toBe(avatarUrl);
    expect(storage().objects.size).toBe(1);
  });

  it('deletes the previous image when it is replaced', async () => {
    await put(PNG_1X1).expect(200);
    await put(PNG_1X1).expect(200);
    expect(storage().objects.size).toBe(1);
    expect([...storage().objects.keys()]).toEqual([(await row()).avatarPublicId]);
  });

  it('rejects content that only claims to be an image', async () => {
    await put(Buffer.from('<script>alert(1)</script>'), 'image/png').expect(415);
    expect((await row()).avatarUrl).toBeNull();
    expect(storage().objects.size).toBe(0);
  });

  it('answers 400 without a file and 413 for an oversized file', async () => {
    await http().put('/me/avatar').set(patient()).field('note', 'no file here').expect(400);
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(MAX_IMAGE_BYTES + 10)]);
    await put(big).expect(413);
    expect(storage().objects.size).toBe(0);
  });

  it('removes the avatar and its stored image', async () => {
    await put(PNG_1X1).expect(200);
    await http().delete('/me/avatar').set(patient()).expect(204);
    const user = await row();
    expect(user.avatarUrl).toBeNull();
    expect(user.avatarPublicId).toBeNull();
    expect(storage().objects.size).toBe(0);
  });
});
