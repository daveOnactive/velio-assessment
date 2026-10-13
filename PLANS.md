# Velio group bookings: plans and current build

This document separates the intended production design from the working prototype in this repository.

## 1. Scope questions and assumptions

| Question                           | Assumption used for the prototype                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Does an invite reserve a spot?     | No. A spot is only taken when a booking or claim succeeds.                                                         |
| What makes a vouch trusted?        | A vouch has a named recipient and can be used once, but the recipient is not verified in this prototype.           |
| How is live availability measured? | Clients send a receipt after receiving an update. The prototype measures receipt latency, not every active client. |
| Can hosts invite people?           | The assessment allows it, but this prototype only lets a direct booker create invites.                             |
| What counts as an invite open?     | The current count is raw. Production needs distinct human opens and bot filtering.                                 |

## 2. Technical plan

### Current architecture

\`backend\` is a Node.js and TypeScript API using Express, Prisma, PostgreSQL, Redis, and Socket.IO. \`web\` is a React app for hosts and bookers. \`mobile\` is a Flutter app for invited guests.

PostgreSQL is authoritative for capacity. Redis and Socket.IO only tell clients to refresh their data.

### Data and safety

- \`activities\` hold the capacity, start time, price, host, and invite flag.
- \`plans\` group a user's bookings for one activity.
- \`bookings\` hold one committed spot and cannot duplicate an activity/user pair.
- \`invites\` record the code, rail, inviter, plan, and expiry.
- \`invite_claims\` record the invite, guest, booking, rail, and generation. A database trigger blocks updates and deletes, making this history immutable.
- \`analytics_events\` and \`availability_receipts\` support the current metrics page.

Direct bookings and invite claims run inside Prisma transactions. They lock the activity row with \`SELECT ... FOR UPDATE\`, recount bookings, verify capacity, and write the related records before committing. This is why two successful requests cannot take the same last spot.

### Live availability

After a booking or claim commits, the API publishes availability through Redis Pub/Sub. API instances send the event to the related Socket.IO room. Web and Flutter clients receive the event, refresh the activity, and send an availability receipt. If Redis is unavailable, the prototype can use a single-process Socket.IO fallback; capacity safety still comes from PostgreSQL.

### Production work not yet built

Production should add a transactional outbox, retries and replay for events, verified delivery for vouch invites, request idempotency keys, rate limits, authenticated identities, and heartbeat-based delivery coverage. These are plans, not claims about the current build.

## 3. Product plan

### Current user flows

1. A host creates an activity in the web app.
2. A booker selects an activity, books one spot, and can create a public share code in the web app.
3. The API supports both public and vouch invite creation. A vouch requires a contact name and is single-use.
4. An invited guest enters a code in the Flutter app, reads the activity details, enters a name, and claims a spot.
5. The Flutter app caches the last invite details and gives haptic feedback after a successful claim.

When capacity is gone, the API returns a conflict and the client shows the error. Cached mobile details can be read offline, but a claim always needs a live connection.

### Important gaps

The web app does not create vouches, hosts cannot create invites, and deep links are not included. There is no waitlist, contact-provider sharing, verified recipient, durable booked state after a web refresh, or transactional event outbox.

## 4. Tracking plan

The API records booking attempts, successful bookings, sold-out rejections, invite creation, invite opens, invite claims, invite exposure, and availability receipts. \`/metrics\` reports capacity safety, a raw booking success ratio, sold-out rejections, availability p95, booker-to-inviter rate, raw open-to-claim rate, and invite/claim counts by rail.

The reported booking ratio is not yet limited to eligible attempts with capacity. Invite opens are not deduplicated, and \`kFactorByRail\` is counts by rail rather than a true K-factor. There is no attendance signal for plans that happen.

For production, assign eligible users to treatment or holdout with a stable random assignment before invite exposure. Measure distinct eligible open-to-claim conversion, claimed guests per inviter, K-factor by rail, and completed plans. Stop or roll back if any oversell occurs, if booking success falls below 99.5%, or if availability p95 rises above two seconds.

## 5. Plan versus shipped prototype

The prototype deliberately proves the highest-risk path: safe capacity allocation and immutable claim attribution. It does not claim production-complete real-time delivery, experimentation, invite trust, or analytics quality. The next delivery should focus on the missing web vouch and host flows, deep links, trustworthy analytics, and the production safeguards listed above.
