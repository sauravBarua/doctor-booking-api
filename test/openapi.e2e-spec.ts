import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from './helpers/test-app';

describe('openapi', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('builds a document for every route', () => {
    const doc = SwaggerModule.createDocument(ctx.app, new DocumentBuilder().build());
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/admin/users', '/notifications']),
    );
  });
});
