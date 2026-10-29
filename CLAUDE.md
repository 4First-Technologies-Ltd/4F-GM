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

### Vendor verification (RC number)

Migration `20261028000000_vendor_rc_number` (`VendorProfile.rcNumber`, unique). Vendors verify with their **CAC RC number**, not uploaded documents. It is asked at sign-up (web `/sign-up`, mobile `vendor-sign-up.tsx` step 3) and editable on the vendor profile page/screen. `lib/rcNumber.ts` normalises any input ("rc 1234567", "1234567") to `RC1234567`; a duplicate is refused with 409 `RC_NUMBER_IN_USE`. The field is optional on `POST/PATCH /api/vendor/profile` only so old app builds keep working; **admins cannot approve a vendor without one** (`PATCH /api/admin/vendors/:id` → 400 `RC_NUMBER_MISSING`), and `/api/auth/me` returns `vendorRcNumberMissing` so the approval banner can prompt existing vendors. The admin vendor list/detail shows and searches the RC number. Account erasure clears it.

The vendor upload endpoints (`/api/vendor/documents*`) and the Documents pages/screens were removed. The `VendorDocument` table and the private R2 bucket (`R2_ACCOUNT_ID`, `R2_BUCKET`, `withViewUrls`) are kept so files uploaded earlier still show in the admin panel ("Earlier uploaded documents") and are deleted on account erasure. The R2 bucket must never be made public.

### Marketplace images (logos, product photos)

Migration `20261026000000_listing_images` (`GasListing.imageKey`). Logos and listing photos must be viewable by anyone, so they live in a **second, public R2 bucket** (`R2_PUBLIC_BUCKET`, base URL `R2_PUBLIC_URL`), never in the private KYC bucket above. Same three-step flow as documents: `POST /api/vendor/images/upload-url` (`kind`: `logo` | `listing`; JPG/PNG/WebP, 5 MB) returns a 5-minute presigned PUT and the object `key`; the client PUTs the bytes to R2; then it saves the key as `logoKey` (`PATCH /api/vendor/profile`) or `imageKey` (listing create/patch). The server only accepts keys under the vendor's own `vendor-logos/<profileId>/` / `listing-images/<profileId>/` prefix that exist in the bucket (`lib/images.ts`). The database stores the **key**; responses carry `logoUrl` / `imageUrl` resolved against `R2_PUBLIC_URL` (`publicImageUrl`), which also passes legacy `data:`/`https:` logos through and drops phone-local `file://` paths. `logoUrl` is no longer accepted as input. Replacing or deleting an image deletes the old object (best effort). Browser uploads (website) need a CORS rule on both buckets allowing `PUT` with `Content-Type` from the site origins. Mobile (`lib/pickVendorImage.ts`), website (`components/vendor/ImageUpload.tsx`) and the marketplace (logo + photo on the listing page and mobile supplier cards) all use it.

### Account deletion (all roles)

`DELETE /api/auth/me` with the password works for **every** role (`lib/accountDeletion.ts`). The account is anonymised in place because orders, earnings and payouts are financial records: personal details, addresses, sessions, and — for businesses — KYC documents, bank details and photos are removed (R2 objects included), listings go out of stock and branches close, and the user is suspended so it leaves the marketplace and can never sign in. It is **refused (409)** while the user has an open order as a customer, paid orders still to deliver (vendor), a delivery in progress (rider, or any rider of a logistics company), or — for vendors — earnings not yet paid out (`CONTACT_SUPPORT`). Logistics-company deletion returns its riders to PENDING (or independent). UI: mobile `components/delete-account.tsx` on every role's account screen, website Settings.

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

## Newsletter

Migration `20261018000000_newsletter`. Website-only sign-up (no mobile UI: it is a public-site feature). Logic in `src/lib/newsletter.ts`, public routes `src/routes/newsletter.ts` at `/api/newsletter`.
- **Double opt-in:** `POST /subscribe` stores a `NewsletterSubscriber` as PENDING and emails a confirm link to the website's `/newsletter/confirm?t=…` (base `WEB_APP_URL`). That page POSTs `/confirm` on a button click, so a mail scanner following the link cannot subscribe anyone. Tokens are stateless HMACs (`UNSUBSCRIBE_SECRET`, falling back to `ADMIN_JWT_SECRET`) with the **purpose signed in**, so a confirm link cannot unsubscribe, and the marketing unsubscribe link cannot touch the newsletter. Confirm links expire after 7 days. Subscribe never reveals whether an address is known, throttles resends per address (2 min), has a honeypot field and `newsletterLimiter`.
- **Sender:** newsletter mail (confirmation and issues) goes from `NEWSLETTER_FROM`, default `newsletters@notifications.4fgmonitor.com`; the domain must be verified in Resend. Replies go to `NEWSLETTER_REPLY_TO` (default `4fgmonitor@gmail.com`). Account/order/marketing mail still uses `EMAIL_FROM`.
- **Separate list from marketing:** subscribers are *not* `User`s and the newsletter does not consult `MarketingSuppression` (and vice versa). Unsubscribing sets `UNSUBSCRIBED` (the row is kept); signing up again goes back to PENDING and needs a fresh confirmation.
- **Sending reuses campaigns:** an issue is a `Campaign` with `newsletter=true` and no segment (admin Marketing → New campaign → audience "Newsletter subscribers"). `startCampaign` freezes the ACTIVE subscribers into `CampaignRecipient` (`userId` null); `runCampaign` re-checks each batch against subscriber status and uses the newsletter unsubscribe link and footer. The admin Newsletter tab lists subscribers read-only.
- **Public archive:** `GET /issues` and `/issues/:id` expose only `newsletter=true` campaigns with status SENT (so sending an issue publishes it on `/newsletter`; drafts and cancelled sends never appear). `{{name}}` becomes "there" there. The web pages revalidate every 5 minutes.

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

## Approval, visibility and loose-gas orders

Oct 2026. **Pending accounts get the whole app; approval only controls who can see them.**
- Vendor, rider and logistics company sign-ups land on their normal dashboard while `PENDING` (`homeRouteFor` on mobile `lib/homeRoute.ts` and web `lib/home-route.ts`). Only `REJECTED` (or an account whose profile was never created) is held on `/vendor-pending`, `/rider-pending` or `/company-pending`. A warning banner (`components/approval-banner.tsx` on mobile, `components/dashboard/ApprovalBanner.tsx` on web) tells them they are not visible yet; it re-reads the user on focus so approval clears it without signing out.
- **A pending vendor can create and edit listings** (`POST /api/vendor/listings` refuses only `REJECTED`). They stay hidden because the marketplace feed and `priceListingOrder` both require `vendor.status = APPROVED`, so approval makes everything live at once. A pending rider's `GET /api/rider/orders` returns an empty list (only approved riders can be assigned; updating a delivery still needs approval). A pending company can read `/api/company/riders` and `/deliveries`, but inviting or removing riders still needs `APPROVED`.
- **Customer cards show the vendor's price per kg** (`₦X / kg`), not the price of the smallest cylinder. A cylinder size is still priced as `pricePerKg × kg` at checkout.
- **Loose gas** (migration `20261027100000_listing_sells_loose`, `GasListing.sellsLoose`, default false, a per-listing opt-in): customers may buy by **size** (as before), by **weight** or by **amount**. The order carries `cylinderSize: "Loose"`, `quantity: 1` and exactly one of `looseKg` (to 0.1 kg) or `looseAmount` (whole naira). The server (`priceLooseOrder` in `lib/pricing.ts`) decides everything: by amount the customer pays exactly that for gas and gets `floor(amount / pricePerKg × 100) / 100` kg; by weight it is `round(pricePerKg × kg)`; the flat delivery fee is added on top either way. Limits 0.5–100 kg. The stored size label is e.g. `4.16 kg (loose)` with quantity 1, so vendor, rider and admin screens that print "size × quantity" need no changes. A listing with `sellsLoose` off rejects loose orders. A loose-only listing may have no cylinder sizes. Previews on mobile (`lib/looseOrder.ts`) and web (`lib/looseOrder.ts`) mirror the server maths; the server is the authority.

## Vendor suspend/delete and admin broadcasts

Migration `20261027200000_broadcasts_and_vendor_suspension`. **All of it is SUPER_ADMIN only**, on the backend (`requireSuperAdmin`) and in the panel (`vendors.suspend`, `vendors.delete`, `broadcasts.read` are granted by name to nobody but `*`; `broadcasts.read` is in `EXPLICIT_ONLY_READS`).
- **Suspend / reinstate a vendor** (`POST /api/admin/vendors/:id/suspend|restore`, reason required, audited `VENDOR_SUSPENDED/RESTORED`): sets `User.isSuspended` plus `suspendedReason/suspendedAt` on the owner and deletes their refresh tokens, so they are signed out and the marketplace feed drops them. Orders already paid for are left alone (the count goes in the audit entry), as with branch suspension. Sign-in shows the reason. A vendor that was deleted cannot be reinstated.
- **Delete a vendor** (`DELETE /api/admin/vendors/:id`, body `{ reason, confirmName }`, audited `VENDOR_DELETED`): the admin types the business name back. It runs the same **anonymise-in-place** routine as self-service deletion (`eraseAccountAsAdmin` in `lib/accountDeletion.ts`: details, KYC documents, bank details and photos removed, listings out of stock, branches closed, sign-in impossible; orders, earnings and payouts kept) and applies the same refusals (paid orders to deliver, earnings not yet paid out, open orders as a customer), worded for an admin. The panel's confirm dialog gained an optional `reasonLabel` (the reason is passed to the action as its third argument).
- **Broadcasts** (`/dashboard/broadcasts`, `routes/admin/broadcasts.ts`, `lib/broadcast.ts`): audience `ALL` | `CONSUMERS` | `VENDORS` | `RIDERS` (riders **and** logistics companies) | `USER` (one account, found by search). Live accounts only (not suspended, not erased). Channels, chosen per message: **in-app** (a `Notification` row per recipient, shown in the mobile `/notifications` screen and the website `/dashboard/notifications`, with an unread bell), **email** (Resend, verified addresses, skips people with `emailNotifEnabled` off) and **push** (Expo push service; skips `pushEnabled` off). Delivery runs in-process after the request returns, like marketing campaigns, so it assumes a single backend instance; the history page shows progress and counts. `BROADCAST_SENT` is audited with the recipient count. Messages cannot be recalled.
- **Push needs setup outside the code:** `PushToken` rows are written by the mobile app (`lib/push.ts`, `components/push-registrar.tsx`, `PUT /api/notifications/push-token`). Android needs a Firebase project and its FCM v1 service-account key uploaded to the Expo project (`eas credentials`), and a build that includes `expo-notifications`; without that the app simply never registers a token and push is silently skipped (in-app and email still work). Optional `EXPO_ACCESS_TOKEN` enables Expo's enhanced push security. The website has no web push.

## Mobile version gate

Migration `20261027000000_app_version_gate` (`PlatformSettings.minAppVersion/latestAppVersion/storeUrlAndroid/storeUrlIos`). Public `GET /api/app-version?platform=android|ios` (`routes/appVersion.ts`, no token, so an old build can still ask) returns `{ min, latest, storeUrl }`. Admin edits it under Settings → Mobile app version (OPERATIONS, audited; refuses min > latest). The app (`gas-monitor/components/update-gate.tsx`, mounted in `app/_layout.tsx`) compares `app.json` `version` to the policy: below `min` it blocks with only an Update button, below `latest` it asks once per version. A failed check lets the app run. Raise `min` only after the new build is live in the store.

## Mobile app builds (EAS)

`gas-monitor/eas.json` defines `development`, `preview`, and `production` build profiles. Android package: `com.fourfirsttechnologies.gasmonitor`. EAS project: `@devopsbbcl/gas-monitor` (project ID in `gas-monitor/app.json` → `extra.eas.projectId`).

**Important:** the `preview` profile sets `SENTRY_DISABLE_AUTO_UPLOAD=true` in its `env` block. Without it, the Gradle build fails during the `createBundleRelease...SentryUpload` task with `error: An organization ID or slug is required (provide with --org)`, because no Sentry org/project/auth-token is configured for build-time source-map upload. If Sentry release tracking is ever wired up properly (org + project + `SENTRY_AUTH_TOKEN`), that env override can be removed.

To build a sideloadable APK: `cd gas-monitor && npx eas build -p android --profile preview --non-interactive --no-wait`, then poll `npx eas build:view <id> --json` for `status`. Free-tier EAS builds can sit `IN_QUEUE` for over an hour — don't assume a build is stuck just because it hasn't started.

## Paystack integration

Payment flow lives in the mobile app (`gas-monitor/app/order/payment.tsx`) via a WebView. The callback URL `https://4fgmonitor.app.local/payment-callback` is **intentionally fake** — it's intercepted by the WebView's navigation listener and never actually loaded. Don't "fix" it to point at a real domain; that would break the interception.

## MyIMO Pay (alternate order gateway)

Migration `20261029000000_order_payment_provider` (`Order.paymentProvider`, default `PAYSTACK`). **The customer chooses the gateway at checkout.** `PAYMENT_PROVIDERS=paystack,myimo` is the enabled list (default Paystack only; MyIMO is dropped from it unless its credentials are set) and `PAYMENT_PROVIDER` is the pre-selected one. Public `GET /api/orders/payment-providers` returns `{ default, providers: [{ id, label }] }`; `/initialize` and `/guest/initialize` take an optional `paymentProvider` (400 if it is not enabled; omitted = the default, so old app builds keep working). Web `/checkout` and the mobile Suppliers order screen show a "Pay with" picker only when more than one gateway is enabled. Each order keeps the provider it started with, so changing the env never strands an order mid-payment, and `/verify` + `/guest/verify` check with that order's own gateway. `paystackRef`/`paystackStatus` hold the reference/status for either gateway (names predate MyIMO). Mobile still intercepts `CALLBACK_URL`; web opens the `authorizationUrl` link.
- Client `src/lib/myimo.ts`, switch `src/lib/paymentProvider.ts`. Spec: `https://apipg.demo.myimopay.com/openapi/v1.json` (the `/api-docs` page is a JS-rendered Scalar UI). Auth is the merchant **Public Key** in the `xp-key` header on every call; it lives in server env only (`MYIMO_PUBLIC_KEY`), never in client code, logs or errors. Staging vs live is **only** `MYIMO_API_URL` + `MYIMO_PUBLIC_KEY` (staging `https://apipg.demo.myimopay.com`, live `https://api.myimopay.com`); never cross them.
- **Staging moves real money.** Test with the smallest practical amounts. **Never call the government endpoint** (`/vi/pay/initiate/gov/...`).
- Paid means `status === 2` (Success), `initial_amount` equal to the order total, and `paid_amount` at least `charged_amount` (`isPaidInFull`). Status codes: 0 Initiated, 1 Pending, 2 Success, 3 Failed, 4 Expired.
- **Payouts stay on Paystack:** MyIMO exposes collection and settlement reports only, no transfers.
- **Gaps to close before going live:** the spec documents no webhook we can receive, so an order is confirmed only when the client calls verify. A customer who pays and then closes the app leaves the order PENDING; the fix is a reconcile job that verifies stale MyIMO PENDING orders. Also unverified on staging: the `tx_ref` length limit (`4FG-<uuid>` is 40 chars), and whether MyIMO redirects the customer to `callback_url` after paying (mobile depends on it; the web checkout copy still says "Paystack").

## Payment gateways and payout accounts

- **Gateway interface** (`gas-monitor-backend/src/lib/gateways/`): every gateway implements `PaymentGateway` (`types.ts`: `initialize`, `verify`, `capabilities.split`, `isConfigured`). `paystackGateway.ts` and `myimoGateway.ts` are the two adapters; `index.ts` is the registry (`getGateway`, `enabledGateways`, `resolveGateway`). **To add a gateway: write an adapter, add it to `ALL` in `index.ts`, list its id in `PAYMENT_PROVIDERS`.** `routes/orders.ts` talks only to this interface. `Order.paymentProvider` stores the adapter id. The `InitializeInput.split` slot exists but both adapters currently reject it: split settlement is not built yet.
- **Payout accounts** (migration `20261029100000_rider_bank_accounts`, `RiderBankAccount`): vendors and riders set their own bank account at `GET/PUT /api/bank/account` (+ `GET /api/bank/banks`, `routes/bankAccount.ts`). The name is resolved from the bank; a change needs the account password (403 `WRONG_PASSWORD`, not 401), is rate-limited, and is refused for a vendor while a payout is PENDING/PROCESSING. Responses carry only the last 4 digits. Web: `PayoutAccountSection` on `/dashboard/profile`; mobile: `components/payout-account.tsx` on the vendor and rider profile screens (needs a new build). Admins can still set a vendor's account. Riders have no earnings or payouts yet, so a rider's saved account is not used by anything.

## Split settlement and rider pay

Migration `20261029200000_split_settlement_and_rider_earnings`. **Both features are off by default** (`GATEWAY_SPLIT_SETTLEMENT`, `RIDER_AUTO_PAYOUT`) because they send bank details to gateways and move real money; nothing here has been run against a live gateway yet.
- **Money rules (all gateways):** the flat delivery fee is frozen per order (`Order.deliveryFee`; 0 on orders placed before the migration, which keep the old maths). The vendor earns `gas × (1 − plan commission)` where gas = total − delivery fee. The platform keeps the commission and the delivery fee. The rider gets `PlatformSettings.riderSharePercent` (default **70, a placeholder**; admin-editable via `PATCH /api/admin/settings`) of the delivery fee.
- **Vendor, instant:** `lib/settlement.ts` `planVendorSplit`. If the gateway has `capabilities.split`, the vendor has a payout account and the flag is on, `gateway.initialize` gets a `split` and the vendor's bank is paid at checkout. Payee codes are cached per gateway in `VendorBankAccount.gatewayRecipients` and cleared when the account changes. Paystack: one subaccount, flat `transaction_charge` = platform share, `bearer: 'account'`. MyIMO: a one-off settlement order per payment (fixed amount to the vendor's subaccount, `settle_merchant`, merchant bears fees) then `/vi/pay/initiate/split`. If the payee can't be registered or the gateway refuses the split, the order is paid normally and the vendor is paid later through Payouts. `Order.vendorSettledByGateway` + `vendorSplitAmount` record it, and the vendor's `Earning` is then created as **`SETTLED`** with the amount actually sent, so a payout never repeats it.
- **Rider, on delivery:** `lib/riderPayouts.ts`. When an order reaches DELIVERED (same hooks as vendor earnings), a `RiderEarning` is recorded (unique per order) and, with `RIDER_AUTO_PAYOUT=true`, paid by Paystack Transfer to the rider's bank account (reference = idempotency key, verified before re-sending). No bank account yet = stays PENDING and is sent when they add one. Outcomes arrive on the existing Paystack webhook. Needs transfers enabled, transfer OTP off and enough **Paystack balance**: on MyIMO orders the platform's share lands at MyIMO, so funds must be moved to Paystack by hand. Riders: `GET /api/rider/earnings`. Admins: `GET /api/admin/rider-payouts`, `POST /:id/retry`.
- **Screens:** riders see Earnings on web (`/dashboard/earnings`, sidebar) and mobile (`app/(rider)/earnings.tsx`, a tab; needs a new build) with a prompt to add a bank account; admin Payouts has a **Rider pay** tab (filter by status, "Send now") and Settings → Commerce has the rider-share %. Earnings with status `SETTLED` show as "Settled at checkout" in the Earnings tab. Vendors see their own ledger at `GET /api/vendor/earnings` (totals: paid at checkout / paid out / awaiting payout / commission, plus each delivered order with its gas price, commission and status): web `/dashboard/earnings` (`components/vendor/VendorEarnings.tsx`) and mobile `app/(vendor)/earnings.tsx`, which replaced a screen that summed gross order totals. No period filter yet.
- **MyIMO credentials differ per endpoint (found 2026-10-29):** payments use `xp-key` (`MYIMO_PUBLIC_KEY`), but the subaccount and settlement-order endpoints want `mp-key` (`MYIMO_MP_KEY`, a separate merchant key; with only `xp-key` they answer "Invalid secret key"). A new subaccount also needs `email_address` and `phone_number` (taken from the vendor's user email and business phone).
- **Paystack test-mode result (2026-10-29, ₦100, split ₦60/₦40):** the subaccount received exactly ₦60 and the platform ₦40. The customer was charged ₦101.53: Paystack reported `bearer: customer` despite `bearer: 'account'` in the request, so the fee is carried by the customer (decision: that is wanted). `paystackGateway.verify` therefore accepts the order total or total + the reported `fees`, nothing else. The split itself is unaffected.
- **Unverified / not built:** the Paystack subaccount and MyIMO settlement-order semantics follow the docs but have not been tried on staging (MyIMO: `settle_merchant` and `charge_bearer: 1` meaning, whether thousands of one-off settlement orders are acceptable, subaccount lookup via the list endpoint). No refund path: cancelling a gateway-settled order does not claw the vendor's share back. Platform (monitor) orders have no vendor and no recorded delivery fee, so riders on them earn nothing.

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
