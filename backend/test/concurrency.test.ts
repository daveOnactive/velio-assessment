import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, transaction } from '../src/db.js';

test('concurrent claims of the last spot yield exactly one booking', async (t) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL is not running');
    return;
  }
  const host = (
    await pool.query(
      "INSERT INTO users(display_name,role) VALUES('Concurrency host','host') RETURNING id",
    )
  ).rows[0].id;
  const activity = (
    await pool.query(
      "INSERT INTO activities(host_id,title,description,starts_at,price_cents,capacity) VALUES($1,'Last spot','Test',now(),0,1) RETURNING id",
      [host],
    )
  ).rows[0].id;
  const users = await Promise.all(
    [...Array(12)].map((_, i) =>
      pool
        .query("INSERT INTO users(display_name,role) VALUES($1,'booker') RETURNING id", [
          `Racer ${i}`,
        ])
        .then((x: { rows: Array<{ id: string }> }) => x.rows[0].id),
    ),
  );
  const attempt = (userId: string) =>
    transaction(async (c) => {
      const a = (
        await c.query('SELECT capacity FROM activities WHERE id=$1 FOR UPDATE', [activity])
      ).rows[0];
      const count = Number(
        (await c.query('SELECT count(*) FROM bookings WHERE activity_id=$1', [activity])).rows[0]
          .count,
      );
      if (count >= a.capacity) return false;
      const p = (
        await c.query('INSERT INTO plans(activity_id,owner_id) VALUES($1,$2) RETURNING id', [
          activity,
          userId,
        ])
      ).rows[0];
      await c.query(
        "INSERT INTO bookings(activity_id,plan_id,user_id,source) VALUES($1,$2,$3,'direct')",
        [activity, p.id, userId],
      );
      return true;
    });
  const results = await Promise.all(users.map(attempt));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    Number(
      (await pool.query('SELECT count(*) FROM bookings WHERE activity_id=$1', [activity])).rows[0]
        .count,
    ),
    1,
  );
});
