import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { OutboxRelayService } from '../src/jobs/outbox-relay.service';
import { bookAppointment, useAsyncFixture } from './helpers/async-fixture';
import { asUser } from './helpers/test-app';

interface Item {
  id: string;
  seq: string;
  title: string;
  readAt: string | null;
}

describe('notifications inbox', () => {
  const s = useAsyncFixture();
  const http = () => request(s.ctx.app.getHttpServer());
  const patient = () => asUser(s.f.patient.email);
  const doctor = () => asUser(s.f.doctor.email);

  const seed = (title: string) =>
    s.ctx.prisma.notification.create({
      data: { userId: s.f.patient.id, type: 't', title, body: 'b', dedupeKey: randomUUID() },
    });

  it('each participant sees only their own notification after a booking', async () => {
    await bookAppointment(s.ctx, s.f);
    await s.ctx.app.get(OutboxRelayService, { strict: false }).runOnce(50, new Date());
    const p = (await http().get('/notifications').set(patient())).body as { items: Item[] };
    const d = (await http().get('/notifications').set(doctor())).body as { items: Item[] };
    expect(p.items).toHaveLength(1);
    expect(d.items).toHaveLength(1);
    expect(p.items[0].id).not.toBe(d.items[0].id);
    expect(typeof p.items[0].seq).toBe('string');
    expect((await http().get('/notifications/unread-count').set(patient())).body).toEqual({
      count: 1,
    });
  });

  it('updates: starts at "now", then returns only newer items in ascending order', async () => {
    await seed('old');
    const start = (await http().get('/notifications/updates').set(patient())).body as {
      items: Item[];
      cursor: string;
    };
    expect(start.items).toEqual([]);
    expect(start.cursor).toMatch(/^\d+$/);

    await seed('a');
    await seed('b');
    const next = (await http().get(`/notifications/updates?after=${start.cursor}`).set(patient()))
      .body as {
      items: Item[];
      cursor: string;
    };
    expect(next.items.map((i) => i.title)).toEqual(['a', 'b']);
    expect(next.cursor).toBe(next.items[1].seq);

    const again = (await http().get(`/notifications/updates?after=${next.cursor}`).set(patient()))
      .body as {
      items: Item[];
      cursor: string;
    };
    expect(again.items).toEqual([]);
    expect(again.cursor).toBe(next.cursor);
  });

  it('history paginates newest first with a before cursor', async () => {
    await seed('n1');
    await seed('n2');
    await seed('n3');
    const page1 = (await http().get('/notifications?limit=2').set(patient())).body as {
      items: Item[];
      nextBefore: string | null;
    };
    expect(page1.items.map((i) => i.title)).toEqual(['n3', 'n2']);
    expect(page1.nextBefore).toBe(page1.items[1].seq);
    const page2 = (
      await http().get(`/notifications?limit=2&before=${page1.nextBefore}`).set(patient())
    ).body as {
      items: Item[];
      nextBefore: string | null;
    };
    expect(page2.items.map((i) => i.title)).toEqual(['n1']);
    expect(page2.nextBefore).toBeNull();
  });

  it('marks one notification read; another user gets 404', async () => {
    const n = await seed('x');
    await http().post(`/notifications/${n.id}/read`).set(doctor()).expect(404);
    await http().post(`/notifications/${n.id}/read`).set(patient()).expect(204);
    await http().post(`/notifications/${n.id}/read`).set(patient()).expect(204); // idempotent
    expect((await http().get('/notifications/unread-count').set(patient())).body).toEqual({
      count: 0,
    });
  });

  it('read-all clears the unread count; anonymous requests are rejected', async () => {
    await seed('a');
    await seed('b');
    await http().post('/notifications/read-all').set(patient()).expect(204);
    expect((await http().get('/notifications/unread-count').set(patient())).body).toEqual({
      count: 0,
    });
    await http().get('/notifications').expect(401);
  });
});
