import 'dotenv/config';
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://velio:velio@localhost:5432/velio',
});
export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function track(
  event: string,
  values: {
    userId?: string;
    activityId?: string;
    inviteId?: string;
    rail?: string;
    payload?: object;
  },
) {
  await pool.query(
    'INSERT INTO analytics_events(event_name,user_id,activity_id,invite_id,rail,payload) VALUES($1,$2,$3,$4,$5,$6)',
    [
      event,
      values.userId || null,
      values.activityId || null,
      values.inviteId || null,
      values.rail || null,
      values.payload || {},
    ],
  );
}
