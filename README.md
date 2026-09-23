# Email Platform

Lightweight multi-tenant SaaS foundation for outbound email creation and sending.

## Phase 1 scope

- Next.js App Router + TypeScript + Tailwind
- PostgreSQL + Prisma
- Organization-based multi-tenancy
- Setup / Lists / Contacts / Campaigns / Dashboard UI
- Tenant-scoped data access helpers

Not included yet: auth, OAuth, email sending, AI scoring/generation, billing.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/email_platform?schema=public"
DEV_ORGANIZATION_ID=
```

### Database safety + migrate

```bash
npm run db:safety
npx prisma migrate deploy
# or for local iterative development:
# npx prisma migrate dev
```

### Test database (required for `npm test`)

Tests never load `.env.local`. They use `TEST_DATABASE_URL` from
`.env.test.example` (or `.env.test` if you override it).

```bash
npm run db:test:up
npm test
```

`npm run db:test:up` starts the test database on `127.0.0.1:5435` (Docker
service `aimed-jobseek-postgres-test` when Docker is available, otherwise a
dedicated cluster in `.local-postgres-test/`) and applies migrations.
`npm run db:test:migrate` can be run on its own. Both refuse Render /
production hosts and do not load `.env.local`. A suite pointed at
production fails with the host name unless `ALLOW_PROD_DB_TESTS=1`
(never use that against customer data).

Read-only inventory of existing test rows in the app database:

```bash
npm run db:test:pollution-report
```

That command only SELECTs. It does not delete.


```bash
npm run db:seed
```

Copy the printed `DEV_ORGANIZATION_ID` into `.env.local`, then:

```bash
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start local app |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed [DEV] organization |
| `npm run db:safety` | Print host/db name; block SalesForecaster; warn on production hosts |
| `npm run db:test:up` | Start TEST Postgres on 5435 (Docker or `.local-postgres-test/`) and migrate |
| `npm run db:test:migrate` | Apply Prisma migrations to the test database only |
| `npm test` | Full suite against TEST_DATABASE_URL (never `.env.local`) |
| `npm run test:smoke` | Production build + `next start` against TEST_DATABASE_URL; GET every app page route (run after `npm run build`) |
