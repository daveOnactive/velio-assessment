# Velio Group Booking

Velio is a group-booking prototype for limited-capacity activities. It includes a TypeScript API, a React web app for hosts and bookers, and a Flutter app for invited guests.

## Prerequisites

Install the following before running the project:

- [Node.js](https://nodejs.org/) 22 or later (includes npm)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose enabled
- [Flutter](https://docs.flutter.dev/get-started/install) with Dart SDK 3.3 or later — required only for the mobile app

The API uses PostgreSQL 16 and Redis 7. Docker Compose starts both services locally, so they do not need separate installations.

## Project structure

```text
backend/        Express API, Prisma schema, database schema, and tests
web/            React + Vite web application
mobile/         Flutter invited-guest application
docker-compose.yml
```

## Run the API and web app

### 1. Configure the environment

Copy the example configuration at the repository root:

```powershell
Copy-Item .env.example .env
```

The defaults work with the included Docker services:

```dotenv
DATABASE_URL=postgresql://velio:velio@localhost:5432/velio
REDIS_URL=redis://localhost:6379
PORT=3001
WEB_ORIGIN=http://localhost:5173
NODE_ENV=development
```

### 2. Start PostgreSQL and Redis

```powershell
docker compose up -d
docker compose ps
```

On its first start, PostgreSQL applies `backend/sql/001_schema.sql` automatically. This creates the application tables and types.

### 3. Install dependencies and generate Prisma Client

Run these commands from the repository root:

```powershell
npm.cmd install
npm.cmd --workspace @velio/api exec prisma generate
```

### 4. Seed demo data

```powershell
npm.cmd run db:seed
```

This clears Velio application data and creates demo users plus two activities. The command prints their IDs for use with the API.

### 5. Start the applications

Use two terminals from the repository root.

Terminal 1:

```powershell
npm.cmd run dev:api
```

Terminal 2:

```powershell
npm.cmd run dev:web
```

Open [http://localhost:5173](http://localhost:5173). The API is available at [http://localhost:3001](http://localhost:3001).

## Local service URLs

| Service           | URL                                  | Purpose                                    |
| ----------------- | ------------------------------------ | ------------------------------------------ |
| Web app           | <http://localhost:5173>              | Host and booker experience                 |
| API health check  | <http://localhost:3001/health>       | Confirms the API is responding             |
| API documentation | <http://localhost:3001/docs>         | Interactive Swagger documentation          |
| OpenAPI document  | <http://localhost:3001/openapi.json> | Machine-readable API definition            |
| Metrics           | <http://localhost:3001/metrics>      | Prototype product and availability metrics |

## Run the Flutter mobile app

Start PostgreSQL, Redis, and the API first. Then run:

```powershell
Set-Location mobile
flutter pub get
flutter run --dart-define=API_URL=http://YOUR_COMPUTER_LAN_IP:3001
```

Replace `YOUR_COMPUTER_LAN_IP` with your development machine's LAN address, for example `192.168.1.25`. A physical device cannot reach its host through `localhost`.

For an Android emulator, the default API URL is `http://10.0.2.2:3001`, so this is usually enough:

```powershell
flutter run
```

For iOS Simulator, pass `http://localhost:3001` explicitly:

```powershell
flutter run --dart-define=API_URL=http://localhost:3001
```

## Commands

Run these from the repository root unless stated otherwise.

| Command                    | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `npm.cmd run dev:api`      | Start the API in watch mode on port 3001                           |
| `npm.cmd run dev:web`      | Start Vite on port 5173                                            |
| `npm.cmd run db:seed`      | Reset application data and create demo data                        |
| `npm.cmd run build`        | Build the API and web app                                          |
| `npm.cmd test`             | Run API tests; PostgreSQL must be running for the concurrency test |
| `npm.cmd run typecheck`    | Type-check the API and web app                                     |
| `npm.cmd run lint`         | Run ESLint                                                         |
| `npm.cmd run format:check` | Check formatting with Prettier                                     |
| `npm.cmd run check`        | Run formatting, linting, type-checking, and builds                 |

For Flutter:

```powershell
Set-Location mobile
flutter analyze
flutter test
```

## Database management

The local schema is initialized from `backend/sql/001_schema.sql` only when PostgreSQL creates a new data volume. After changing that SQL and needing a clean local database, run:

```powershell
docker compose down -v
docker compose up -d
npm.cmd run db:seed
```

> Warning: `docker compose down -v` deletes the local PostgreSQL data volume. Do not use it if you need to retain local data.

`backend/prisma/schema.prisma` defines the generated Prisma Client. Regenerate it after changing the Prisma schema:

```powershell
npm.cmd --workspace @velio/api exec prisma generate
```

## Configuration reference

| Variable       | Default                                         | Description                                   |
| -------------- | ----------------------------------------------- | --------------------------------------------- |
| `DATABASE_URL` | `postgresql://velio:velio@localhost:5432/velio` | PostgreSQL connection string                  |
| `REDIS_URL`    | `redis://localhost:6379`                        | Redis connection string for real-time updates |
| `PORT`         | `3001`                                          | API HTTP and Socket.IO port                   |
| `WEB_ORIGIN`   | `http://localhost:5173`                         | Web origin permitted by Socket.IO CORS        |
| `NODE_ENV`     | `development`                                   | `development`, `test`, or `production`        |
| `VITE_API_URL` | `http://localhost:3001`                         | Optional web API URL                          |
| `API_URL`      | `http://10.0.2.2:3001`                          | Flutter compile-time API URL                  |

To point the web app at another API, create `web/.env.local` with:

```dotenv
VITE_API_URL=http://localhost:3001
```

Restart Vite after changing it.

## Troubleshooting

- **Docker services do not start:** Make sure Docker Desktop is running, then inspect `docker compose logs postgres` and `docker compose logs redis`.
- **The API cannot connect to PostgreSQL or Redis:** Run `docker compose ps`, verify `.env`, then restart the API.
- **A port is already in use:** Change `PORT` or `WEB_ORIGIN` in `.env`; for Vite, update `web/vite.config.ts` or stop the process using port 5173.
- **Schema changes do not appear:** The SQL initialization script runs only for a new PostgreSQL volume. Follow the database reset steps above.
- **A phone cannot reach the API:** Use the computer's LAN IP in `API_URL`, ensure both devices use the same network, and allow port 3001 through the firewall.

## Prototype notes

PostgreSQL is the inventory source of truth. Direct bookings and invite claims lock the relevant activity row inside a transaction, preventing overselling under concurrent requests. Redis Pub/Sub distributes availability updates to Socket.IO clients, which refetch activity data before rendering it.

The prototype intentionally does not include authentication, payments, transactional outbox delivery, deep-link infrastructure, or production experiment tooling. `DEMO_MODE=true` enables an in-memory UI walkthrough only; it is not transactional and must not be used to validate capacity behavior.

See [PLANS.md](PLANS.md) for the intended product and technical approach, and [OWNERSHIP.md](OWNERSHIP.md) for the experiment-investigation workflow.
