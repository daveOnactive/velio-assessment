import { pool } from './db.js';
async function run() {
  await pool.query(
    'TRUNCATE analytics_events,invite_claims,bookings,invites,plans,activities,users CASCADE',
  );
  const ada = (
    await pool.query(
      "INSERT INTO users(display_name,role,feature_variant) VALUES('Ada — Host','host','treatment') RETURNING id",
    )
  ).rows[0];
  const ben = (
    await pool.query(
      "INSERT INTO users(display_name,role,feature_variant) VALUES('Ben — Booker','booker','treatment') RETURNING id",
    )
  ).rows[0];
  const holdout = (
    await pool.query(
      "INSERT INTO users(display_name,role,feature_variant) VALUES('Mina — Holdout','booker','holdout') RETURNING id",
    )
  ).rows[0];
  const guest = (
    await pool.query(
      "INSERT INTO users(display_name,role,feature_variant) VALUES('Guest preview','guest','treatment') RETURNING id",
    )
  ).rows[0];
  const activities = await pool.query(
    `INSERT INTO activities(host_id,title,description,starts_at,price_cents,capacity) VALUES
 ($1,'Sunset Kayaking','A calm golden-hour paddle with a small local group.',now()+interval '4 days',4500,8),
 ($1,'Secret Speakeasy Tour','Follow the clues through hidden Lagos cocktail rooms.',now()+interval '9 days',6500,4) RETURNING id,title`,
    [ada.id],
  );
  console.log(
    JSON.stringify(
      {
        users: { host: ada.id, booker: ben.id, holdout: holdout.id, guest: guest.id },
        activities: activities.rows,
      },
      null,
      2,
    ),
  );
  await pool.end();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
