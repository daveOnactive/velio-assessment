import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://velio:velio@localhost:5432/velio',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PORT: process.env.PORT,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
});
