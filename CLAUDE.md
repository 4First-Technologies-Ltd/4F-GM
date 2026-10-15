# CLAUDE.md

This is the root of the 4FG Smart Gas Monitor monorepo. It provides guidance to Claude Code when working anywhere in this repository. Sub-projects have their own `CLAUDE.md`/`README.md` with deeper detail — this file is the map that tells you which one to open.

## Repo layout

```
4FG-MONITOR/
├── gas-monitor/              # Expo React Native app (consumer + vendor mobile client)
├── gas-monitor-backend/      # Express + Prisma + PostgreSQL API — the real backend, deployed on Render
├── gas-monitor-web-v2/       # Next.js 15 consumer/vendor web app (the web app; Tailwind v4 + R3F)
├── gas-monitor-admin/        # Next.js 15 internal admin panel (separate project, shares the DB)
├── landing/                  # Static marketing site + waitlist admin (plain HTML/JS)
├── supabase/functions/       # Supabase Edge Functions (waitlist email confirmation)
└── screenshots/              # App screenshots for docs
```

Only `gas-monitor/` has its own `CLAUDE.md` today (routing tables, screen-by-screen architecture, API client methods). Read it before touching anything under `gas-monitor/app/`.

## Which backend is real

**`gas-monitor-backend/` is the live, deployed API** — Express + Prisma + PostgreSQL on Render at `https://ugo.4fgmonitor.com`, port `9000` locally. Routes live in `src/routes/{auth,vendor,orders,ordersWebhook,cylinders,addresses,analytics,contact}.ts` and `src/routes/admin/{adminUsers,analytics,auth,customers,listings,orders,settings,stats,users,vendors}.ts`. It has a `GET /health` endpoint and CORS gated by the `CORS_ORIGINS` env var.

`gas-monitor-web-v2` and `gas-monitor-admin` both call this backend via `NEXT_PUBLIC_API_URL`. **`gas-monitor-web-v2` is the only web app.** The older `gas-monitor-web` and `gas-monitor-3d-web` are retired: they are git-ignored and no longer tracked, any copy on disk is a leftover, and nothing should be built, mirrored or fixed there.

**`gas-monitor-admin` has no server-side data layer of its own.** Its `app/api/**`, `lib/server/**` and `prisma/` directories were deleted in the Admin Dashboard OS refactor (2026-09-03): they were an unreachable byte-for-byte copy of `src/routes/admin/*`, left behind when the backend was split out. `@prisma/client`, `prisma`, `bcryptjs` and `jsonwebtoken` were dropped from its dependencies at the same time. The admin now talks to the backend exclusively through `lib/api.ts` → `adminFetch`. Do not reintroduce Prisma there.

**The backend owns the schema and the migrations** (`gas-monitor-backend/prisma/`; its `start` script runs `prisma migrate deploy`). No other project has a Prisma schema to keep in sync: `gas-monitor-web-v2` and `gas-monitor-admin` read and write only through the API.

## Projects at a glance

| Project | Stack | Local port | Production |
|---|---|---|---|
| `gas-monitor` | Expo SDK 54, expo-router, React 19 | Metro (`npm start`) | EAS Build (see below) |
| `gas-monitor-backend` | Express, Prisma, PostgreSQL | `9000` | Render — `ugo.4fgmonitor.com` |
| `gas-monitor-web-v2` | Next.js 15 App Router | `3000`* (Docker `3140`) | `4fgmonitor.com` |
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

### Admin two-factor authentication

Migration `20261010000000_admin_mfa`. TOTP (RFC 6238, `src/lib/totp.ts`, no third-party OTP library) is **required for every named admin** unless `ADMIN_MFA_REQUIRED=false`. Login is two steps: `POST /api/admin/auth/login` returns `{ mfaRequired, challenge }` (a 5-minute signed token that is *not* a session; `verifyAdminSession` rejects it), then `POST /login/mfa` with a 6-digit code or a single-use recovery code. An admin with no factor yet gets a session that `guard()` blocks with `MFA_ENROLLMENT_REQUIRED` everywhere except `/auth/*`; the panel sends them to `/dashboard/account` to enrol (`/auth/mfa/setup` → `/auth/mfa/enable`, which returns 8 recovery codes once and signs out other sessions). Secrets are AES-256-GCM encrypted (`MFA_ENCRYPTION_KEY`, falling back to `ADMIN_JWT_SECRET`); `mfaLastStep` blocks code replay. Lost phone → another SUPER_ADMIN uses `POST /admin-users/:id/mfa-reset` ("Reset 2FA" row action); you cannot reset your own. The env root login has no row: set `ADMIN_ROOT_TOTP_SECRET` to put a factor on it, or `ADMIN_ROOT_LOGIN_DISABLED=true` once a named super admin has enrolled.

### Vendor document storage

Vendor KYC files live in a **private Cloudflare R2 bucket** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; `src/lib/storage.ts`). Flow: `POST /api/vendor/documents/upload-url` validates type (JPG/PNG/WebP/PDF) and size (8 MB), returns a 5-minute presigned PUT with type and length signed in; the app PUTs the file straight to R2; `POST /api/vendor/documents` takes only the issued `key`, checks it sits under the vendor's own `vendor-docs/<profileId>/` prefix and exists in R2, then stores it in `VendorDocument.url`. Reads (admin vendor/user detail, vendor `/me`) swap the key for a 5-minute presigned GET via `withViewUrls`; rows from before this existed hold a phone-local `file://` path and come back with `url: null`. The R2 bucket must never be made public.

## Vendor branches

Migration `20261015000000_vendor_branches`. A vendor (`VendorProfile`) stays the business, KYC, plan and payout entity; a `Branch` is a location that sells and owns address, lat/lng, phone, listings and orders. The backend owns the schema; `gas-monitor-web-v2` has no Prisma and reads branches through the API only.
- **Never hard-deleted** (orders reference it): close with `isActive=false`. Exactly one `isMain` per vendor, enforced by a partial unique index that exists only in the migration SQL (Prisma cannot express it).
- The migration backfills a "Main branch" per vendor from its business location and links existing listings/orders. `POST /api/vendor/profile` seeds the main branch for new vendors and accepts `branches[]` for extras at sign-up. `GasListing.branchId`/`Order.branchId` are still **nullable** — tighten `GasListing.branchId` to NOT NULL in a later migration once nothing writes without it.
- Routes `src/routes/vendorBranches.ts` at `/api/vendor/branches` (list/create/patch/`make-main`/`deactivate`/`reactivate`). Every one resolves the branch through `findOwnBranch(vendorId, id)` (`lib/branches.ts`) — a client-sent branch id is never trusted alone. The cap is `PLANS[plan].maxBranches` (placeholder values: Basic 1, Growth 5, Pro 20 — a business decision), counted over *active* branches in a serializable transaction.
- Close is refused for the main branch and while the branch has PENDING/CONFIRMED/OUT_FOR_DELIVERY orders. Listings on a closed branch drop off the marketplace and cannot be ordered.
- `Order.branchId` is derived from the listing in `priceListingOrder`, never from the request. Earnings and payouts remain per vendor.
- **Admin suspension** (migration `20261015100000_branch_suspension`): `POST /api/admin/vendors/:id/branches/:branchId/suspend|restore` (OPERATIONS, `branches.suspend`, reason required, audited as `BRANCH_SUSPENDED`/`BRANCH_RESTORED`). Separate from the vendor's own `isActive`: a suspended branch drops off the marketplace and cannot be ordered from, and the vendor cannot reopen, promote or list on it. Orders already in flight are left alone (count recorded in the audit entry).
- **Branch managers** (migration `20261015200000_branch_staff`; `Role.BRANCH_MANAGER`, table `branch_staff`): the owner invites by email (`/api/vendor/branches/:id/staff`, 14-day expiry, max 10 per branch). **Managers never use the public sign-up** (`POST /api/auth/register` rejects `BRANCH_MANAGER`). The invite is **emailed** (`sendManagerInviteEmail`, link base `WEB_APP_URL`) with a one-time token (only its sha256 is stored in `branch_staff.tokenHash`, cleared on use, rotated on every re-invite) to the website's private **`/accept-invite`** page, where the manager sets a name and password. Opening the link proves they own the address, so there is no separate verification. The public `GET /api/staff/invite/:token` and `POST /api/staff/invite/:token/accept` (`routes/staffInvite.ts`, own rate limiter) create the account in a transaction with a compare-and-set on the invite, and sign them in; an email that already belongs to another kind of account is refused (`EMAIL_IN_USE`), and an existing manager just has the branch added. Whether an email already has an account is never revealed to the vendor. Invites sent before the token existed have no link and must be re-sent; an existing manager account still picks up such an invite by verified email (`claimInvites`). `/api/staff/*` is scoped to `branch_staff` ACTIVE rows on every query: orders and stock of their branch(es) only — no earnings, documents, plan, profile or branch management; customer email is never returned. Managers may only move CONFIRMED/OUT_FOR_DELIVERY orders forward (never unpaid PENDING ones) with a compare-and-set, assign approved riders, and toggle `inStock`. Revoking keeps the row as history. Mobile app: `gas-monitor/app/(manager)/` for signed-in managers (they accept the invite on the website, then sign in on the Vendor tab), owner UI under each branch on the Branches screen. If email is not configured (`RESEND_API_KEY` unset) the invite is saved and the owner is told it was not sent. **Known gap:** the *vendor* order PATCH (`routes/vendor.ts`) has no transition rules, so an owner can still move an unpaid order; managers are deliberately stricter.
- **Web parity (`gas-monitor-web-v2`):** every branch feature is on the website as well as the app. **Rule: a feature is not done until it exists on web (v2), mobile and admin where relevant.** Vendors get `/dashboard/branches` (`components/vendor/BranchManager.tsx`: add, edit, make main, close, reopen, suspended state, and managers per branch with invite/remove), an optional **Other branches** section on the vendor sign-up form (`BranchDraftFields`, stashed with the pending vendor profile and sent as `branches[]`), and a branch picker, filter and label on `/dashboard/listings`. Branch managers get their account from the emailed invite (`/accept-invite`, no tab on `/sign-up`) and get Orders (`/dashboard`, `components/manager/ManagerOrders.tsx`), Stock (`/dashboard/stock`) and an Account page listing their branches; rider assignment reuses `AssignRiderModal` with the manager endpoints. The public marketplace shows the branch a listing is sold from: its address, city/state, coordinates and phone, and `Vendor · Branch name` unless it is the seed "Main branch" (`toCatalogListing` in `lib/marketplace.ts`).
- Not built: per-branch KYC, per-branch bank accounts, manager access to earnings or rider/branch reports, admin-side revoke of a manager (admins suspend the branch or the account instead).
- **Admin view of branch staff:** `/dashboard/branch-staff` (`GET /api/admin/branch-staff`, read-only, `branchStaff.read` via the `*.read` wildcard so every admin role sees it). Filters by Active/Invited/Expired/Revoked — an INVITED row past `expiresAt` is shown and filtered as EXPIRED. The vendor detail modal also lists each branch's managers.

## Logistics companies (rider fleets)

Migration `20261016000000_logistics_companies`. `Role.LOGISTICS_COMPANY`, tables `logistics_companies` and `fleet_invites`, plus `RiderProfile.companyId` / `approvedViaCompany`. A company is a fleet owner: it invites riders by email and watches their deliveries. **It does not assign orders** — vendors, branch managers and admins still assign individual riders, who are labelled with their company in the picker. Riders have no earnings or payouts today, so the company has none either.
- **Approval:** an admin approves the company once (`/dashboard/companies`, `PATCH /api/admin/companies/:id`, OPERATIONS `companies.approve`, audited as `COMPANY_APPROVED/REJECTED/STATUS_RESET`). A rider is then **assignable only while their company is APPROVED**, and that is *derived*, never copied onto riders: `ASSIGNABLE_RIDER` / `effectiveRiderStatus` in `lib/fleet.ts` are the single rule, used by the vendor, branch-manager and admin assignment routes, the rider's own routes and `riderStatus` in the auth responses. Rejecting a company pulls its whole fleet off the road at once; approving it again brings them back. Deliveries already out are not cancelled.
- **Invite flow:** `/api/company/riders/invite` (14-day expiry, max 200 per fleet). The rider signs up as a normal RIDER with that email. The invite is **claimed once their email is verified and they have a rider profile** (`claimFleetInvite`, on profile create, `GET /api/rider/me` and `GET /api/auth/me`), only from an APPROVED company. Claiming approves a PENDING rider (`approvedViaCompany=true`); an already-approved independent rider just gains the link. An admin-REJECTED rider is never pulled in, and a rider already in another fleet is left alone.
- **Leaving:** removing a rider (`removeFromFleet`) sends a company-approved rider back to PENDING; an independently approved one keeps working. If a company row is ever deleted, `approvedViaCompany` with no company counts as not approved.
- **Company API** `/api/company/*`: profile routes work while PENDING (so sign-up can finish); fleet routes need APPROVED. Everything is scoped to the company id resolved from the signed-in user. `/deliveries` shows rider, vendor name and delivery address, never customer email or phone. A company cannot set its own status.
- **Sign-up structure (web and mobile):** three categories only: **Consumer**, **Vendor**, **Rider**. Vendor is **one form** (a vendor runs one location or grows into many whenever they like; it has an optional "Other branches" section for the board's "create branches at sign-up" requirement, and the Branches page for later). Rider has two tabs, **Single Rider** and **Logistics Company** (`LOGISTICS_COMPANY`), because those are genuinely different sign-ups. Branch managers are not a sign-up category. Sign-in keeps three tabs: companies use **Rider**, managers use **Vendor**.
- **Mobile:** `/company-sign-up` (`?resume=1` to finish details only), `/company-pending`, and `app/(company)/` (Riders, Deliveries, Account). It is the **Logistics Company** sub-tab under **Rider** on the sign-up screens (`components/signup-tabs.tsx`). Companies sign in from the **Rider** tab. The admin rider list shows each rider's fleet.
- **Web (`gas-monitor-web-v2`):** the **Logistics Company** sub-tab under **Rider** on `/sign-up` (`/sign-up?role=company` lands on it), `/company-pending`, and for an approved company the dashboard shows Fleet (`/dashboard`), Deliveries (`/dashboard/deliveries`) and a read-only Company card on the profile page. Code in `components/company/`, `lib/company.ts`, `companyApi` in `lib/api.ts`. Companies sign in on the Rider tab here too. Branch managers sign in on the Vendor tab here too.
- **Not built:** company KYC documents (the R2 upload flow is vendor-only, so approval rests on the details and the admin's own checks), company-level dispatch (assign an order to a company, which picks the rider), company earnings or payouts.

## Payouts and support inbox

Added to the admin panel in Oct 2026, modelled on GoBuyMe's CRM/payout modules. Migration `20261009000000_payouts_and_support` (backend-owned).

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

Migration `20261009100000_crm_and_pipeline` (backend-owned). Routes: `src/routes/admin/crm.ts`, mounted at `/api/admin/crm`.
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
