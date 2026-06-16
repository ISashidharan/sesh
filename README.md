# sesh

Multi-tenant calendar scheduling platform. Businesses define bookable calendars
with working hours; end-users book appointments ("seshes") into open slots at
fixed intervals (30/45/60 min). Designed to embed into existing websites and to
sync with external calendar providers (Google first).

## Architecture

```
apps/
  api/        Fastify + Prisma + Postgres. Pure domain logic in services/
              (the Phase 2 AI agent will call these as tools).
  web/        React SPA — admin dashboard + public booking page (coming).
packages/
  shared/     Zod schemas + TS types shared by api and web.
```

- **Multi-tenancy:** shared Postgres, `tenantId` on every row; services scope all
  queries by tenant. Postgres RLS is added as a backstop in a later migration.
- **Auth:** Clerk (managed B2B). In dev, `DEV_AUTH=true` lets you authenticate
  with an `x-dev-clerk-user` header instead of real tokens.
- **Availability is computed**, never stored: working hours − exceptions −
  existing seshes (± buffers) − external busy times → bookable slots.

## Prerequisites

- Node 20+
- Docker (for the dev Postgres) — or any Postgres reachable via `DATABASE_URL`.

## Getting started

```bash
npm install

# Start dev Postgres (host port 5433, to avoid clashing with a native 5432)
npm run db:up

# Configure the API env
cp apps/api/.env.example apps/api/.env

# Create the schema and seed a demo tenant
npm run db:migrate
npm run db:seed --workspace @sesh/api

# Run the API (http://localhost:4000)
npm run dev:api

# In another terminal, run the web app (http://localhost:5173)
cp apps/web/.env.example apps/web/.env
npm run dev:web
```

The admin dashboard is at http://localhost:5173 and the public booking page at
http://localhost:5173/book/acme. The web app currently authenticates admin
requests with the dev header (matching the API's `DEV_AUTH` mode); swapping in
Clerk means replacing the header in `apps/web/src/lib/api.ts` with a Bearer token
and flipping `DEV_AUTH=false` on the API.

### Try it

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/db

# Admin call (dev auth header = a seeded User.clerkUserId)
curl http://localhost:4000/calendars -H "x-dev-clerk-user: dev_owner"
```

## Milestone 1 status (core booking engine)

- [x] Monorepo, shared types, dev Postgres
- [x] Fastify API foundation: env, error handling, auth hook, tenant resolver
- [x] Tenants (onboarding) + Calendars
- [x] Working hours + exceptions
- [x] Sesh types
- [x] Availability computation + endpoint (timezone- & DST-aware, buffer-aware)
- [x] Booking (transactional, serializable) — admin + public
- [x] React SPA: admin dashboard (calendars, working hours, exceptions, sesh
      types, bookings) + public booking page
- [ ] Embeddable widget stub

Later: Google Calendar two-way sync, then Microsoft & Apple; Phase 2 AI agent.
