# gas-monitor-admin

Internal admin panel for the 4FG Gas Monitor platform. Connects to the same
Supabase Postgres database as `gas-monitor-web` (via Prisma) so it can manage
production data without touching the consumer/vendor app.

## Features

- **Overview** — user, vendor, order, listing counts and confirmed revenue.
- **Vendors** — review pending vendor signups (with uploaded documents), approve or reject.
- **Users** — search all consumers/vendors, see role, verification and order count.
- **Orders** — browse all orders across every vendor, filter by status.
- **Listings** — browse all gas listings, toggle stock status.

## Auth

Single admin account via environment variables (`ADMIN_USERNAME` /
`ADMIN_PASSWORD`), not tied to the `users` table. Logging in issues a signed,
httpOnly JWT session cookie (`ADMIN_JWT_SECRET`). There's no self-service
signup — only whoever holds the env credentials can get in.

## Setup

```bash
npm install
npm run dev # runs on http://localhost:3010
```

`.env.local` is already populated with the shared `DATABASE_URL`/`DIRECT_URL`.
Before deploying anywhere reachable, **change `ADMIN_PASSWORD`** and consider
rotating `ADMIN_JWT_SECRET`.

This project only reads/writes existing tables — it does not own migrations.
Run `npx prisma db pull` here if the schema in `gas-monitor-web` changes and
you want to sync it.
