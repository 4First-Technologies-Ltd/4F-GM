# CLAUDE.md

This is the root of the 4FG Smart Gas Monitor monorepo. It provides guidance to Claude Code when working anywhere in this repository. Sub-projects have their own `CLAUDE.md`/`README.md` with deeper detail — this file is the map that tells you which one to open.

## Repo layout

```
4FG-MONITOR/
├── gas-monitor/              # Expo React Native app (consumer + vendor mobile client)
├── gas-monitor-backend/      # Express + Prisma + PostgreSQL API — the real backend, deployed on Railway
├── gas-monitor-web/          # Next.js 15 consumer/vendor web dashboard
├── gas-monitor-admin/        # Next.js 15 internal admin panel (separate project, shares the DB)
├── landing/                  # Static marketing site + waitlist admin (plain HTML/JS)
├── supabase/functions/       # Supabase Edge Functions (waitlist email confirmation)
└── screenshots/              # App screenshots for docs
```

Only `gas-monitor/` has its own `CLAUDE.md` today (routing tables, screen-by-screen architecture, API client methods). Read it before touching anything under `gas-monitor/app/`.

## Which backend is real

**`gas-monitor-backend/` is the live, deployed API** — Express + Prisma + PostgreSQL on Railway at `https://gas-monitor-backend-production.up.railway.app`, port `9000` locally. Routes live in `src/routes/{auth,vendor,orders,ordersWebhook,cylinders,addresses,analytics,contact}.ts` and `src/routes/admin/{adminUsers,analytics,auth,customers,listings,orders,settings,stats,users,vendors}.ts`. It has a `GET /health` endpoint and CORS gated by the `CORS_ORIGINS` env var.

`gas-monitor-web` and `gas-monitor-admin` both call this backend via `NEXT_PUBLIC_API_URL` — their own `app/api/**` routes are thin proxies, not independent business logic. Their local `prisma/schema.prisma` + `DATABASE_URL`/`DIRECT_URL` (Supabase Postgres) still exist and are queried directly for some data, but auth/vendor/order/cylinder logic should be looked up in `gas-monitor-backend/src/routes/` first, not reimplemented in the Next.js apps.

`gas-monitor-web/prisma/schema.prisma` and `gas-monitor-admin/prisma/schema.prisma` are **two separate copies of the same schema**, kept in sync manually (no shared package) — when you change one, mirror the change in the other.

## Projects at a glance

| Project | Stack | Local port | Production |
|---|---|---|---|
| `gas-monitor` | Expo SDK 54, expo-router, React 19 | Metro (`npm start`) | EAS Build (see below) |
| `gas-monitor-backend` | Express, Prisma, PostgreSQL | `9000` | Railway — `gas-monitor-backend-production.up.railway.app` |
| `gas-monitor-web` | Next.js 15 App Router | `3000`* | `4fgmonitor.com` |
| `gas-monitor-admin` | Next.js 15 App Router | `3010` | `4fgmpanel.4fgmonitor.com` |
| `landing` | Static HTML + Supabase Edge Functions | — | — |

*This machine also runs an unrelated project ("Ekorafon") on ports 3000/3001/3002. **Never assume those ports are free or safe to kill** — verify with `netstat -ano | grep :<port>` and check the response body actually looks like a 4FG app before touching any process on them. `gas-monitor-admin` was deliberately moved to port `3010` to avoid this collision.

## User roles

Two roles shared across mobile, web, and backend: `CONSUMER` and `VENDOR` (Prisma `Role` enum). Vendors have a `VendorProfile` with `VendorStatus`: `PENDING` / `APPROVED` / `REJECTED` — new vendor signups require manual approval via `gas-monitor-admin`. Admin panel auth is separate from these two roles entirely — see below.

## Admin panel auth

`gas-monitor-admin` login is **not** part of the `User`/`Role` system. It checks env `ADMIN_USERNAME`/`ADMIN_PASSWORD` first (signs in as `SUPER_ADMIN`), then falls back to an `AdminUser` table (`AdminRole`: `SUPER_ADMIN` / `OPERATIONS` / `SUPPORT`, bcrypt-hashed passwords). Role scoping: `SUPPORT` gets no settings access; sub-admin management (`/api/admin-users*`) is `SUPER_ADMIN`-only via `requireSuperAdmin`.

## Mobile app builds (EAS)

`gas-monitor/eas.json` defines `development`, `preview`, and `production` build profiles. Android package: `com.fourfirsttechnologies.gasmonitor`. EAS project: `@devopsbbcl/gas-monitor` (project ID in `gas-monitor/app.json` → `extra.eas.projectId`).

**Important:** the `preview` profile sets `SENTRY_DISABLE_AUTO_UPLOAD=true` in its `env` block. Without it, the Gradle build fails during the `createBundleRelease...SentryUpload` task with `error: An organization ID or slug is required (provide with --org)`, because no Sentry org/project/auth-token is configured for build-time source-map upload. If Sentry release tracking is ever wired up properly (org + project + `SENTRY_AUTH_TOKEN`), that env override can be removed.

To build a sideloadable APK: `cd gas-monitor && npx eas build -p android --profile preview --non-interactive --no-wait`, then poll `npx eas build:view <id> --json` for `status`. Free-tier EAS builds can sit `IN_QUEUE` for over an hour — don't assume a build is stuck just because it hasn't started.

## Paystack integration

Payment flow lives in the mobile app (`gas-monitor/app/order/payment.tsx`) via a WebView. The callback URL `https://4fgmonitor.app.local/payment-callback` is **intentionally fake** — it's intercepted by the WebView's navigation listener and never actually loaded. Don't "fix" it to point at a real domain; that would break the interception.

## Design tokens

Shared light-green theme across mobile and both web dashboards:

| Token | Value |
|---|---|
| Background | `#EDF7ED` |
| Primary text | `#1A2E1A` |
| Accent / CTA | `#2D7450` |
| Clay accent (web/admin charts) | `#A9714C` |
| Danger | `#D32F2F` |
| Font | Fira Sans (UI), Fira Code (numeric readouts) |

Full mobile design system: `gas-monitor/design-system/MASTER.md`.

## Where to look next

- Mobile screens, routing, and API client methods → `gas-monitor/CLAUDE.md`
- Backend route implementations → `gas-monitor-backend/src/routes/`
- Admin panel pages and RBAC → `gas-monitor-admin/app/dashboard/`
- Top-level product overview and setup steps → `README.md`
