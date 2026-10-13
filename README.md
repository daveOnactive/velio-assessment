# Velio group booking

A time-boxed prototype for limited-capacity activities, group plans, invites, and live availability.

## Repository layout

\`\`\`text
backend/ Node.js + TypeScript API
web/ React + Vite host and booker app
mobile/ Flutter invited-guest app
\`\`\`

## Quick start

1. Install Node.js 22+, Docker Desktop, and Flutter 3.3+ for the mobile app.
2. Copy \`.env.example\` to \`.env\`, then run \`docker compose up -d\`.
3. Run \`npm.cmd install\`, \`npm.cmd --workspace @velio/api exec prisma generate\`, and \`npm.cmd run db:seed\`.
4. Run \`npm.cmd run dev:api\` and \`npm.cmd run dev:web\`, then open \`http://localhost:5173\`.
5. API documentation is at \`http://localhost:3001/docs\`; metrics are at \`http://localhost:3001/metrics\`.
6. For mobile, run \`cd mobile && flutter pub get && flutter run --dart-define=API_URL=http://YOUR_LAN_IP:3001\`.

Run \`npm.cmd run typecheck\`, \`npm.cmd run build\`, and \`npm.cmd test\` for Node checks. The concurrency test needs PostgreSQL running. If it is not running, the test is skipped rather than passed. Run \`flutter analyze && flutter test\` from \`mobile\` when Flutter is installed.

## Architecture and decisions

PostgreSQL is the source of truth. Direct bookings and invite claims run in Prisma transactions that lock the activity row with \`SELECT ... FOR UPDATE\`, count committed bookings, and write the plan and booking together. This prevents overselling when people try to take the last spot at the same time.

After a booking or claim commits, the API publishes the new availability through Redis Pub/Sub. Each API instance forwards it to the matching Socket.IO activity room. Web and mobile clients then refetch the activity; the real-time message never decides inventory.

Invite claims are immutable attribution records. The database trigger rejects updates and deletes from \`invite_claims\`. A claim stores the invite, guest, booking, rail, and invite generation.

## What is included and what is not

The prototype includes activity creation, direct booking, API support for vouch and public invites, invite claims, basic live availability, a web host/booker flow, a Flutter guest flow, cached mobile invite details, haptic claim feedback, and a metrics endpoint.

The web app creates public share codes only. There are no host-created invites, deep links, verified vouch delivery, transactional outbox, request idempotency keys, or true randomized holdout assignment. The database-free \`DEMO_MODE\` walkthrough is only for UI exploration. It is not transactional and must not be used to validate capacity safety or SLOs.

## Tracking

\`/metrics\` shows the capacity invariant, raw booking attempt-to-success ratio, sold-out rejections, availability receipt p95, booker-to-inviter rate, raw invite-open-to-claim rate, and invite/claim counts by rail.

The endpoint does not yet calculate a true K-factor by rail: its \`kFactorByRail\` field currently returns created-invite and claimed-invite counts. Invite opens are also raw events, not deduplicated human opens. Use the endpoint to inspect the prototype, not to make production experiment decisions.

## Plan versus reality and trade-offs

\`PLANS.md\` documents the intended product, technical, and tracking approach, then separates it from the smaller working prototype. \`OWNERSHIP.md\` shows how the team should investigate the supplied conversion problem before changing the product.

In the 48-hour scope, the priority was correct capacity allocation and durable invite attribution. Payments, authentication, contact delivery, abuse protection, transactional outbox retries, deep-link infrastructure, and production experimentation are future work.
