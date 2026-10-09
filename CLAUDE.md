# CLAUDE.md

This is the root of the 4FG Smart Gas Monitor monorepo. It provides guidance to Claude Code when working anywhere in this repository. Sub-projects have their own `CLAUDE.md`/`README.md` with deeper detail — this file is the map that tells you which one to open.

## Repo layout

```
4FG-MONITOR/
├── gas-monitor/              # Expo React Native app (consumer + vendor mobile client)
├── gas-monitor-backend/      # Express + Prisma + PostgreSQL API — the real backend, deployed on Render
├── gas-monitor-web/          # Next.js 15 consumer/vendor web dashboard
├── gas-monitor-admin/        # Next.js 15 internal admin panel (separate project, shares the DB)
├── landing/                  # Static marketing site + waitlist admin (plain HTML/JS)
├── supabase/functions/       # Supabase Edge Functions (waitlist email confirmation)
└── screenshots/              # App screenshots for docs
```

Only `gas-monitor/` has its own `CLAUDE.md` today (routing tables, screen-by-screen architecture, API client methods). Read it before touching anything under `gas-monitor/app/`.

## Which backend is real

**`gas-monitor-backend/` is the live, deployed API** — Express + Prisma + PostgreSQL on Render at `https://ugo.4fgmonitor.com`, port `9000` locally. Routes live in `src/routes/{auth,vendor,orders,ordersWebhook,cylinders,addresses,analytics,contact}.ts` and `src/routes/admin/{adminUsers,analytics,auth,customers,listings,orders,settings,stats,users,vendors}.ts`. It has a `GET /health` endpoint and CORS gated by the `CORS_ORIGINS` env var.

`gas-monitor-web` and `gas-monitor-admin` both call this backend via `NEXT_PUBLIC_API_URL`.

**`gas-monitor-admin` has no server-side data layer of its own.** Its `app/api/**`, `lib/server/**` and `prisma/` directories were deleted in the Admin Dashboard OS refactor (2026-09-03): they were an unreachable byte-for-byte copy of `src/routes/admin/*`, left behind when the backend was split out. `@prisma/client`, `prisma`, `bcryptjs` and `jsonwebtoken` were dropped from its dependencies at the same time. The admin now talks to the backend exclusively through `lib/api.ts` → `adminFetch`. Do not reintroduce Prisma there.

`gas-monitor-web/prisma/schema.prisma` is a second copy of the schema kept in sync manually with `gas-monitor-backend/prisma/schema.prisma`. **The backend is the migration owner** — its `start` script runs `prisma migrate deploy`, and it is currently ahead of web (`devicePhone`, `audit_logs`). Add migrations there and mirror the schema into web.

## Projects at a glance

| Project | Stack | Local port | Production |
|---|---|---|---|
| `gas-monitor` | Expo SDK 54, expo-router, React 19 | Metro (`npm start`) | EAS Build (see below) |
| `gas-monitor-backend` | Express, Prisma, PostgreSQL | `9000` | Render — `ugo.4fgmonitor.com` |
| `gas-monitor-web` | Next.js 15 App Router | `3000`* | `4fgmonitor.com` |
| `gas-monitor-admin` | Next.js 15 App Router (no Prisma) | `3010` | `4fgmpanel.4fgmonitor.com` |
| `landing` | Static HTML + Supabase Edge Functions | — | — |

*This machine also runs an unrelated project ("Ekorafon") on ports 3000/3001/3002. **Never assume those ports are free or safe to kill** — verify with `netstat -ano | grep :<port>` and check the response body actually looks like a 4FG app before touching any process on them. `gas-monitor-admin` was deliberately moved to port `3010` to avoid this collision.

## User roles

Three roles shared across mobile, web, and backend: `CONSUMER`, `VENDOR`, and `RIDER` (Prisma `Role` enum). Vendors have a `VendorProfile` with `VendorStatus`: `PENDING` / `APPROVED` / `REJECTED` — new vendor signups require manual approval via `gas-monitor-admin`. Riders (delivery agents) work the same way via `RiderProfile` and its own `RiderStatus` enum — not owned by any one vendor, so an approved rider can be assigned to any vendor's order. `Order.riderId`/`assignedAt` track that assignment, and `OrderStatus` has an `OUT_FOR_DELIVERY` step between `CONFIRMED` and `DELIVERED` for it. Vendors assign riders to their own orders (`PATCH /api/vendor/orders/:id/rider`); admins can reassign platform-wide (`PATCH /api/admin/orders/:id/rider`) — both endpoints only ever touch `riderId`/`assignedAt`, never `status` or payment fields, per the read-only stance on order mutations below. Admin panel auth is separate from all three of these roles — see below.

## Admin panel auth

`gas-monitor-admin` login is **not** part of the `User`/`Role` system. It checks env `ADMIN_USERNAME`/`ADMIN_PASSWORD` first (signs in as `SUPER_ADMIN`), then falls back to an `AdminUser` table (`AdminRole`: `SUPER_ADMIN` / `OPERATIONS` / `SUPPORT`, bcrypt-hashed passwords).

Role scoping is **rank-based** and lives in `gas-monitor-backend/src/middleware/requireAdmin.ts` (`SUPPORT` 0 < `OPERATIONS` 1 < `SUPER_ADMIN` 2):

| Guard | Minimum role | Applied to |
|---|---|---|
| `requireAdmin` | SUPPORT | admin reads, except the admin list and audit log |
| `requireOperations` | OPERATIONS | vendor approval, listing stock, user create/update/delete, settings, and read-only `GET /api/admin/admin-users` |
| `requireSuperAdmin` | SUPER_ADMIN | admin-user writes (create/update/delete), `/api/admin/audit*`; the Security page is also super-admin-only in the UI |

Every mutating admin route writes to `audit_logs` via `src/lib/audit.ts`. The audit trail is append-only and surfaced at `/dashboard/audit`, visible to super admins only.

## Payouts and support inbox

Added to the admin panel in Oct 2026, modelled on GoBuyMe's CRM/payout modules. Migration `20261009000000_payouts_and_support` (backend-owned; **not yet mirrored into `gas-monitor-web/prisma/schema.prisma`**, which was already behind).

**Payouts** (`/dashboard/payouts`, `src/routes/admin/payouts.ts`, `src/lib/{earnings,payouts,paystack}.ts`):
- An `Earning` row is written when a vendor order reaches `DELIVERED` (vendor PATCH and rider PATCH both call `recordEarningSafe`; `POST /api/admin/payouts/sync-earnings` backfills older orders). Commission % is frozen on the row from the vendor's plan (`PLANS` in `lib/plans.ts`), so a later plan change never rewrites history. Orders with no `vendorId` (monitor sales) earn nothing.
- A `Payout` claims a vendor's AVAILABLE earnings with a compare-and-set inside one transaction, then sends a Paystack Transfer. The reference is the idempotency key; `dispatchPayout` verifies the reference with Paystack before sending, so a timed-out request is adopted rather than duplicated. Outcomes arrive on the existing `/api/orders/webhook` (`transfer.success|failed|reversed`).
- Vendor bank accounts are set by admins (`PUT /payouts/vendors/:id/bank-account`); the account **name is resolved from the bank**, never typed. There is no vendor-facing UI for this yet.
- Paystack prerequisites: transfers enabled on the account, **transfer OTP disabled** (otherwise payouts fail with an explanatory message), the server IP whitelisted, and enough balance.
- Guards: initiate/retry/cancel/bank-account/sync = `requireOperations`; `mark-paid` (settled outside Paystack) = `requireSuperAdmin`.

**Support inbox** (`/dashboard/support`, `src/routes/admin/support.ts`, `src/lib/tickets.ts`):
- The public `POST /api/contact` now opens a `Ticket` (and still emails the support mailbox). SLA is a first-response deadline by priority (`SLA_HOURS`); there is no scheduled escalation job yet — breaches are computed on read.
- **Deliberate exception to the "SUPPORT is read-only" rule:** ticket routes use `requireAdmin`, so SUPPORT can reply, assign and change ticket status (`support.reply`). Canned-reply management is `requireOperations` (`support.manage`).
- Replies go out through Resend. **Inbound email is not wired up**: a customer's reply lands in the support mailbox, and an agent logs it on the ticket with "Log customer reply".

## CRM and acquisition pipeline

Migration `20261009100000_crm_and_pipeline` (backend-owned, not mirrored into web). Routes: `src/routes/admin/crm.ts`, mounted at `/api/admin/crm`.
- **Pipeline** (`/dashboard/pipeline`): `Lead` = a vendor or rider being recruited, stages NEW → CONTACTED → ONBOARDING → WON/LOST. Every stage move writes a `LeadActivity`; LOST requires a reason. Moving to WON links the lead to a `User` with the same email if one exists. Leads are *not* accounts — approving the real vendor/rider still happens in Vendors/Riders.
- **Tasks** (`/dashboard/tasks`): `CrmTask`, optionally tied to a lead or an account.
- **Account notes and tags** appear in the user detail modal (`admin/primitives/crm-panel.tsx`), so every list that opens an account has them. Notes and tags are open to every admin role (`crm.note`); leads and tasks are OPERATIONS (`crm.manage`).
- Not built from GoBuyMe: automations.

## Server logs, app usage, ops briefing

Migration `20261009300000_logs_usage_briefing`.
- **Server logs** (`/dashboard/server-logs`, SUPER_ADMIN via `logs.read` in `EXPLICIT_ONLY_READS`): `lib/serverLog.ts` wraps `console.warn/error` and the Express error handler, buffers, and batch-writes to `server_logs` (Render's disk is ephemeral, so no log files). Entries are **redacted** (bearer tokens, JWTs, `password`/`token`/`secret` values, and OTP codes — `lib/email.ts` prints OTPs when Resend is unset) and pruned after 14 days. The buffer is capped at 500 and writes never throw; `installServerLogCapture()` must stay first in `index.ts`. Only `console.warn/error` are captured, not `console.log`.
- **App usage** (`/dashboard/usage`): `POST /api/events` is public and defended (batch ≤25, 2 KB properties, strict event names, 60 req/min/IP, timestamps clamped, `userId` only from a valid access token). The mobile tracker is `gas-monitor/lib/analytics.ts`, started from `app/_layout.tsx` (`app_opened`, `screen_viewed` with the route *pattern*, never ids). **Only builds that include the tracker send data; the web app is not instrumented yet.** Queries stitch an install to the user it later signed in as, and bucket by Lagos day.
- **Ops briefing** (`/dashboard/briefing`): `lib/opsBriefing.ts` builds a metrics snapshot and rule-based flags (each with an action and a link) for the previous Lagos day, stores it in `ops_briefings`, and posts it to Telegram (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; link base `ADMIN_PANEL_URL`). A 15-minute check after 07:00 Lagos creates the day's row; the unique `day` key means only the run that creates the row sends, so restarts don't double-post — it still assumes a single instance for no duplicate *work*. `OPS_BRIEFING_ENABLED=false` disables it. "Live" figures (stuck orders, open tickets) always describe *now*, even when an old day is rebuilt. No LLM: thresholds live in `deriveFlags`. "Delivered" is approximated by `Order.updatedAt` (there is no status-change timestamp).

## Marketing email

Migration `20261009200000_marketing`. Admin routes `src/routes/admin/marketing.ts` (`/api/admin/marketing`), public `src/routes/marketing.ts` (`/api/marketing/unsubscribe`), logic in `src/lib/marketing.ts`. **Email only (Resend)** — no SMS yet.
- `Segment.filter` is JSON validated by `segmentFilterSchema` and resolved to a Prisma query at send time (so an audience is "who matches now"). Eligible = email verified, not suspended, not on `MarketingSuppression`.
- Sending: `startCampaign` flips DRAFT→SENDING with a compare-and-set, freezes recipients into `CampaignRecipient`, then `runCampaign` sends in batches of 50 via `resend.batch.send` (~700ms apart), re-checking suppression per batch. It runs in-process and `resumeCampaigns()` (called from `index.ts`) picks up any SENDING campaign after a restart — it assumes **a single backend instance**.
- Every email carries `List-Unsubscribe` (+ one-click POST) and a footer link. The link is an HMAC of the email (`UNSUBSCRIBE_SECRET`, falling back to `ADMIN_JWT_SECRET` — rotating it breaks old links). GET only shows a confirm page; the opt-out happens on POST so mail scanners can't unsubscribe people. Needs `API_PUBLIC_URL`.
- Guards: create/edit/send/cancel = OPERATIONS (`marketing.manage`); removing someone from the suppression list = SUPER_ADMIN (`marketing.unsuppress`).
- Marketing consent is not modelled beyond unsubscribe; `User.emailNotifEnabled` is a notification preference and is deliberately not consulted.

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
- Admin panel pages and RBAC → `gas-monitor-admin/app/dashboard/` (thin routes) and `gas-monitor-admin/admin/` (the resource engine, primitives, permissions and per-module configs). Its architecture and remaining gaps are documented in `gas-monitor-admin/ADMIN_DASHBOARD_REPORT.md`.
- Top-level product overview and setup steps → `README.md`
