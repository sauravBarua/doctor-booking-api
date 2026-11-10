import { describe, expect, it } from 'vitest';
import { useAsyncFixture } from './helpers/async-fixture';

describe('audit log is append-only', () => {
  const s = useAsyncFixture();
  const insert = () =>
    s.ctx.prisma.auditLog.create({
      data: { action: 'test.action', entityType: 'test', entityId: 'x' },
    });

  it('rejects UPDATE', async () => {
    const row = await insert();
    await expect(
      s.ctx.prisma
        .$executeRaw`UPDATE audit_logs SET action = 'tampered' WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow();
    expect((await s.ctx.prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } })).action).toBe(
      'test.action',
    );
  });

  it('rejects DELETE', async () => {
    const row = await insert();
    await expect(
      s.ctx.prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow();
    expect(await s.ctx.prisma.auditLog.count()).toBe(1);
  });
});
