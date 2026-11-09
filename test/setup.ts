import { config } from 'dotenv';

// Test values first. dotenv never overrides, so .env.test wins over .env.
config({ path: '.env.test', quiet: true });
config({ quiet: true });

const databaseUrl = process.env.DATABASE_URL ?? '';
const redisUrl = process.env.REDIS_URL ?? '';

if (!databaseUrl.endsWith('_test') || !redisUrl.endsWith('/1')) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL must end with "_test" and REDIS_URL with "/1". ' +
      'Check .env.test.',
  );
}
