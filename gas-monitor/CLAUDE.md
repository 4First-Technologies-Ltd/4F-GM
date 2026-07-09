# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Mobile app (run from `gas-monitor/`)
```bash
npm run start          # Start Expo dev server (scan QR with Expo Go, or press a/i/w)
npm run android        # Launch on Android emulator
npm run ios            # Launch on iOS simulator
npm run web            # Open in browser
npm run lint           # Run ESLint via expo lint
npm run reset-project  # Move app/ to app-example/ and create a blank app/ directory
```

### Backend (run from `gas-monitor-backend/`)
```bash
npm run dev            # Start Express server with tsx watch (hot reload, port 9000)
npm run build          # tsc compile to dist/
npm start              # Run compiled JS (production)
npx prisma migrate dev # Apply schema changes + regenerate client
npx prisma studio      # Open Prisma Studio (DB browser, localhost:5555)
```

No test runner is configured yet.

---

## Architecture

This is an **Expo SDK 54** app using **expo-router** (file-based routing), React Native 0.81.5, and React 19 with the React Compiler and new architecture both enabled.

---

## User types

The app supports two distinct user roles set at registration:

| Role | Value | Journey |
|---|---|---|
| Consumer | `CONSUMER` | Monitors gas level, browses suppliers, places orders via Paystack |
| Vendor | `VENDOR` | Lists gas products, receives and manages orders |

Role is stored on `User.role` in the database and in SecureStore as part of the saved user object. All role-based routing reads `getSavedUser<ApiUser>()` after login — never hardcode `/(tabs)` as the post-login destination.

---

## Routing & Navigation

`app/` maps directly to URL routes. `unstable_settings.anchor = 'splash'` so the stack always starts at splash.

### Full user flow

```
splash.tsx
  ├── no token → /onboarding
  │     └── role picker (slide 3) → /sign-up (consumer) | /vendor-sign-up (vendor)
  │           └── register() → /verify-email → verifyOtp() issues session
  │                 ├── CONSUMER → /(tabs)
  │                 └── VENDOR → creates vendor profile → /vendor-pending
  └── token exists → check role
        ├── CONSUMER → /(tabs)
        └── VENDOR
              ├── APPROVED → /(vendor)
              └── PENDING/REJECTED → /vendor-pending
```

`authApi.register()` no longer returns a session — email verification is mandatory. It creates an unverified account, emails a 6-digit OTP via Resend, and returns `{ message, email }`. The client must call `authApi.verifyOtp(email, otp)` to get tokens. `sign-in.tsx` applies the same role check as above after `authApi.login()` resolves; if the account isn't verified yet, login fails with `code: 'EMAIL_NOT_VERIFIED'` and the screen redirects to `/verify-email` instead of showing a generic error.

`/forgot-password` (new) is a self-contained 3-step screen (email → OTP + new password → done) that doesn't touch the auth session — it calls `authApi.forgotPassword()`/`resetPassword()` directly.

### Route table

| File | Route | Notes |
|---|---|---|
| `app/splash.tsx` | `/splash` | Animated logo, token + role check, auto-navigates after 2.2s |
| `app/onboarding.tsx` | `/onboarding` | 3-slide carousel; slide 3 shows role picker cards |
| `app/sign-in.tsx` | `/sign-in` | Email + password; routes to `/(tabs)` or `/(vendor)` based on role, or `/verify-email` if unverified |
| `app/sign-up.tsx` | `/sign-up` | Consumer registration → `/verify-email` |
| `app/vendor-sign-up.tsx` | `/vendor-sign-up` | 3-step vendor registration → `/verify-email` (business info held in `lib/pendingVendorProfile.ts` until OTP verified) |
| `app/verify-email.tsx` | `/verify-email` | 6-digit OTP entry; on success issues session, creates pending vendor profile if `role=VENDOR` param present, then routes to `/(tabs)` or `/vendor-pending` |
| `app/forgot-password.tsx` | `/forgot-password` | Email → OTP + new password → done (inline steps, no session involved) |
| `app/vendor-pending.tsx` | `/vendor-pending` | Holding screen shown until admin approves vendor |
| `app/(tabs)/` | `/(tabs)` | Consumer tab group |
| `app/(tabs)/_layout.tsx` | — | `<Tabs>` navigator |
| `app/(tabs)/index.tsx` | `/(tabs)/` | Consumer dashboard (gas gauge, AI insights, refill reminder) |
| `app/(tabs)/history.tsx` | `/(tabs)/history` | Usage history |
| `app/(tabs)/device.tsx` | `/(tabs)/device` | Sensor status |
| `app/(tabs)/settings.tsx` | `/(tabs)/settings` | Account & preferences, sign-out |
| `app/(tabs)/explore.tsx` | — | Hidden from tab bar (`href: null`) |
| `app/(vendor)/` | `/(vendor)` | Vendor route group — custom slide-in drawer |
| `app/(vendor)/_layout.tsx` | — | Drawer layout + `DrawerCtx` / `useDrawer()` context |
| `app/(vendor)/index.tsx` | `/(vendor)/` | Incoming orders (vendor home) |
| `app/(vendor)/listings.tsx` | `/(vendor)/listings` | Gas listing CRUD |
| `app/(vendor)/earnings.tsx` | `/(vendor)/earnings` | Earnings placeholder |
| `app/(vendor)/settings.tsx` | `/(vendor)/settings` | Vendor account settings + sign-out |
| `app/order/_layout.tsx` | — | Stack navigator for the entire order section |
| `app/order/(tabs)/_layout.tsx` | — | Bottom tab bar: Suppliers / Order History / My Addresses |
| `app/order/(tabs)/index.tsx` | `/order` | Supplier list + order form (inline screen state) |
| `app/order/(tabs)/history.tsx` | `/order/history` | Tappable order history cards |
| `app/order/(tabs)/addresses.tsx` | `/order/addresses` | Saved delivery addresses (add / remove / set default) |
| `app/order/[id].tsx` | `/order/:id` | Order detail — status banner, timeline, items, payment info |
| `app/order/_shared.ts` | — | Shared `HistoryOrder` type, `MOCK_ORDERS`, `STATUS_META`, `fmtPrice` |
| `app/order/payment.tsx` | `/order/payment` | Full-screen Paystack WebView; intercepts callback URL |
| `app/order/payment-success.tsx` | `/order/payment-success` | Animated success screen shown after verified payment |
| `app/modal.tsx` | `/modal` | Generic modal |

Stack animation config:

| Screen | Animation | Gesture |
|---|---|---|
| `splash` | none | — |
| `onboarding` | fade | disabled |
| `sign-in`, `sign-up`, `vendor-sign-up`, `verify-email`, `forgot-password` | slide_from_right | enabled |
| `vendor-pending`, `(tabs)`, `(vendor)` | fade | disabled |
| `order` | slide_from_bottom | disabled |
| `order/[id]` | slide_from_right | enabled |
| `order/payment` | slide_from_bottom | disabled |
| `order/payment-success` | fade | disabled |

---

## Consumer order flow (`app/order/`)

The order section is a **nested Stack + Tabs** structure:

```
order/_layout.tsx          ← Stack (slide_from_bottom from /(tabs))
  order/(tabs)/_layout.tsx ← Tabs (Suppliers | Order History | My Addresses)
    order/(tabs)/index.tsx      Suppliers tab
    order/(tabs)/history.tsx    History tab
    order/(tabs)/addresses.tsx  Addresses tab
  order/[id].tsx           ← Detail screen (pushed onto Stack)
  order/payment.tsx        ← Paystack WebView (pushed onto Stack)
  order/payment-success.tsx← Success confirmation (replaces payment)
```

### Suppliers tab (`order/(tabs)/index.tsx`)

Two internal states controlled by `useState<'suppliers' | 'order'>`:

- **`suppliers`** — lists `SUPPLIERS` mock data filtered by gas type, sorted by haversine distance. Tapping a card sets `selectedSupplier` and switches to `order`.
- **`order`** — order form with cylinder size selector, quantity stepper, delivery address dropdown, and order summary. Tapping **Place Order** calls `ordersApi.initialize()` then navigates to `order/payment`.

Delivery address is a dropdown (tappable selector → bottom sheet modal) populated from `savedAddresses` local state. The modal supports selecting a saved address or adding a new one inline.

### Order detail (`order/[id].tsx`)

Looks up order by `id` param in `MOCK_ORDERS` from `_shared.ts`. Sections:
1. Status banner (color-coded: green = delivered, orange = processing, red = cancelled)
2. Supplier card (avatar, name, address, gas type badge, rating)
3. Order timeline (vertical stepper; hidden for cancelled)
4. Order items (cylinder icon, size, qty, unit price, subtotal, total)
5. Delivery details (address, date, time)
6. Payment (method, amount)
7. Action button: **Reorder** (delivered) / **Cancel Order** (processing) / **Place New Order** (cancelled)

### Payment flow

1. `ordersApi.initialize()` → `POST /api/orders/initialize` → returns `{ authorizationUrl, reference, orderId, amount }`
2. App pushes `order/payment` with those params
3. `payment.tsx` loads `authorizationUrl` in a `react-native-webview` `<WebView>`
4. WebView intercepts navigation to `https://4fgmonitor.app.local/payment-callback` (set as `callback_url` in backend)
5. On intercept → `ordersApi.verify(reference)` → `POST /api/orders/verify`
6. On success → `router.replace('/order/payment-success')` with confirmation params
7. Success screen shows animated checkmark, supplier, amount, reference; buttons: **View Order History** / **Back to Home**

---

## Vendor sign-up (`app/vendor-sign-up.tsx`)

3-step form with a progress indicator:

| Step | Fields |
|---|---|
| 1 — Account | Personal name, business name, email, password |
| 2 — Business | Phone number, business address (multiline), GPS location (optional) |
| 3 — Verify | Identity document upload via `expo-image-picker` (skip allowed) |

On submit (step 3):
1. Business info + documents are stashed in-memory via `setPendingVendorProfile()` (`lib/pendingVendorProfile.ts`) — a module-level variable, not persisted storage, since it only needs to survive the navigation to `/verify-email`.
2. `authApi.register(name, email, password, 'VENDOR')` — creates an unverified user, emails an OTP. No session yet.
3. `router.replace('/verify-email?email=...&role=VENDOR')`.

`/verify-email` then calls `authApi.verifyOtp()` (issuing the session), reads back the pending profile via `takePendingVendorProfile()`, calls `vendorApi.createProfile(...)` and `vendorApi.uploadDocuments(...)` (if docs were selected), and finally routes to `/vendor-pending`.

---

## Vendor app (`app/(vendor)/`)

### Drawer navigation

No `@react-navigation/drawer` dependency. The drawer is a custom `Animated.View` panel (width = 78% of screen, max 320px) that slides in from the left, with a semi-transparent backdrop. Controlled by `DrawerCtx`:

```tsx
import { useDrawer } from '@/app/(vendor)/_layout';
const { openDrawer } = useDrawer();
```

Every vendor screen has a hamburger button (`line.3.horizontal` icon) that calls `openDrawer()`.

Drawer items: Incoming Orders → My Listings → Earnings → Settings | Sign Out (pinned to bottom).

### Vendor approval

Vendors start with `status = PENDING`. Listings can only be created once `status = APPROVED`. To approve manually during development:
```bash
# From gas-monitor-backend/
npx prisma studio   # localhost:5555 → VendorProfile → set status = APPROVED
```

---

## Auth & Storage layer

**`lib/storage.ts`** — SecureStore helpers (uses `expo-secure-store`):
- Keys: `4fg_access_token`, `4fg_refresh_token`, `4fg_user`
- `saveSession(accessToken, refreshToken, user)` — persists all three
- `getAccessToken()` / `getRefreshToken()` / `getSavedUser<T>()` — typed reads
- `clearSession()` — deletes all three keys (called on sign-out)

**`lib/api.ts`** — Typed fetch wrapper + API clients:
```
API_BASE_URL:
  dev + Android  → http://10.0.2.2:9000
  dev + iOS/web  → http://localhost:9000
  production     → https://your-production-api.com
```

### `authApi` methods

| Method | Endpoint | Notes |
|---|---|---|
| `register(name, email, password, role?)` | POST `/api/auth/register` | `role` defaults to `'CONSUMER'`. Creates an **unverified** account, emails a 6-digit OTP via Resend. Returns `{ message, email }` — no session, no `saveSession` call |
| `verifyOtp(email, otp)` | POST `/api/auth/verify-otp` | Verifies a signup OTP, marks `emailVerified`, calls `saveSession` |
| `resendOtp(email, purpose)` | POST `/api/auth/resend-otp` | `purpose` is `'SIGNUP_VERIFICATION'` or `'PASSWORD_RESET'` |
| `login(email, password)` | POST `/api/auth/login` | Calls `saveSession`; response includes `role` + `vendorStatus`. Throws `ApiRequestError` with `code: 'EMAIL_NOT_VERIFIED'` if the account hasn't verified its email yet |
| `refresh()` | POST `/api/auth/refresh` | Rotates token pair, returns null on failure |
| `logout()` | POST `/api/auth/logout` | Revokes refresh token, always calls `clearSession` |
| `me()` | GET `/api/auth/me` | Returns full user including `role` + `vendorStatus` |
| `forgotPassword(email)` | POST `/api/auth/forgot-password` | Always responds the same way regardless of whether the account exists (no enumeration). Emails an OTP if it does |
| `resetPassword(email, otp, password)` | POST `/api/auth/reset-password` | Verifies the OTP and updates the password; revokes all refresh tokens |

### `vendorApi` methods

| Method | Endpoint | Notes |
|---|---|---|
| `createProfile(data)` | POST `/api/vendor/profile` | Upserts vendor profile |
| `getProfile()` | GET `/api/vendor/me` | Returns profile + documents + listings |
| `uploadDocuments(docs)` | POST `/api/vendor/documents` | Accepts `{ url, fileName }[]` |
| `getListings()` | GET `/api/vendor/listings` | Returns vendor's own listings |
| `createListing(data)` | POST `/api/vendor/listings` | Requires APPROVED status |
| `updateListing(id, data)` | PATCH `/api/vendor/listings/:id` | Partial update |
| `deleteListing(id)` | DELETE `/api/vendor/listings/:id` | — |
| `getOrders()` | GET `/api/vendor/orders` | Includes consumer + listing data |
| `updateOrderStatus(id, status)` | PATCH `/api/vendor/orders/:id` | `CONFIRMED \| DELIVERED \| CANCELLED` |

### `ordersApi` methods

| Method | Endpoint | Notes |
|---|---|---|
| `initialize(payload)` | POST `/api/orders/initialize` | Creates DB order, calls Paystack, returns `authorizationUrl` + `reference` |
| `verify(reference)` | POST `/api/orders/verify` | Verifies Paystack transaction; marks order `CONFIRMED` |
| `list()` | GET `/api/orders` | Consumer's own orders |

### `ApiUser` type

```ts
interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: 'CONSUMER' | 'VENDOR';
  vendorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}
```

---

## Auth screens

**`sign-in.tsx`** — After `authApi.login()`, reads saved user and routes:
- `VENDOR + APPROVED` → `/(vendor)`
- `VENDOR + other` → `/vendor-pending`
- `CONSUMER` → `/(tabs)`
- Login throwing `code: 'EMAIL_NOT_VERIFIED'` → `/verify-email?email=...` instead of showing an error

**`sign-up.tsx`** — Consumer only. On success: `router.replace('/verify-email?email=...')`.

**`vendor-sign-up.tsx`** — Vendor only. On success: `router.replace('/verify-email?email=...&role=VENDOR')`.

**`verify-email.tsx`** — Single OTP field (6-digit, numeric) + resend link. On `authApi.verifyOtp()` success: creates the pending vendor profile if `role=VENDOR` was passed, then routes to `/(tabs)` or `/vendor-pending`.

**`forgot-password.tsx`** — 3 inline steps (`useState<'email' | 'reset' | 'done'>`): email → OTP + new password + confirm → done. Doesn't touch the auth session; ends with a link back to `/sign-in`.

All auth screens use `KeyboardAvoidingView` + `ScrollView`. Shared local `Field` component renders label + styled `TextInput` + optional password toggle + inline error. Validation runs on submit.

---

## Theming

`constants/theme.ts` exports `Colors` (light/dark token map), `StatusColors`, `SensorStatus` type, and `Fonts`. Hooks:
- `hooks/use-theme-color.ts` — resolves a token from `Colors` for the current scheme
- `hooks/use-color-scheme.ts` — re-exports RN's `useColorScheme`; `.web.ts` variant defaults to `'light'`
- `hooks/use-app-fonts.ts` — loads Fira Sans (400/500/700) and Fira Code (400/500/700) via `expo-font`

The root `_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` and gates rendering on `useAppFonts()`.

### App-wide color palette

All screens share a consistent light green palette defined locally as `const C = { ... }`:

| Token | Value | Usage |
|---|---|---|
| `bg` | `#EDF7ED` | Page/SafeAreaView background |
| `card` | `#FFFFFF` | Card and surface backgrounds |
| `surface` | `#F5FBF5` | Inset surfaces, segment controls |
| `border` | `#E0EEE0` | Card borders, dividers |
| `text` | `#1A2E1A` | Primary text |
| `muted` | `#7A9A7A` | Secondary/label text |
| `accent` | `#2D7450` | Primary action color, active states |
| `accentLight` | `#E8F5E8` | Tinted backgrounds, active chips |
| `red` | `#D32F2F` | Destructive actions, critical status |

Tab bar (consumer + order section): white bg, `#2D7450` active, `#9EBA9E` inactive.

Onboarding/auth screens use a separate `C` palette with `greenBright: '#22C55E'` and `greenDark: '#1A4730'`.

---

## Consumer dashboard (`app/(tabs)/index.tsx`)

Two visual zones:
1. **Top** (`#EDF7ED`): app header, segmented arc gauge, status badge, action buttons
2. **White card** (`borderTopLeftRadius: 28`, `marginTop: -28`): stats row, AI insights, refill reminder, demo controls

**Segmented Arc Gauge (`GaugeRing`):** 48 bars in a 300° arc. `gasLevel` is `useState(100)` — replace with live sensor value when backend sensor data is wired up.

**Refill Reminder:** time picker grid (4 options) → "Reminder Active" state with cancel link.

**Simulate Drain:** animates `gasLevel` 100→0 over ~24s via `setInterval` ref. Auto-scrolls to gauge on start.

**Order Refill button** → `router.push('/order')` — navigates into the order section Stack.

---

## Onboarding screen (`app/onboarding.tsx`)

3-slide horizontal `ScrollView` with `pagingEnabled`.

| Slide | Content |
|---|---|
| 1 | `IllustrationMonitor` — 6 icon circles around central 4FG device mockup |
| 2 | `IllustrationAlerts` — styled alert card + green confirm circle |
| 3 | Hero photo bg + overlay; shows role picker cards (Consumer / Vendor) + "Log In" link |

Slide 3 role picker: two frosted-glass cards with `house.fill` (Consumer → `/sign-up`) and `storefront.fill` (Vendor → `/vendor-sign-up`).

---

## Platform-specific files

- `components/ui/icon-symbol.ios.tsx` — SF Symbols via `expo-symbols`
- `components/ui/icon-symbol.tsx` — `@expo/vector-icons/MaterialIcons` fallback for Android/web

**When adding a new icon:** add the SF Symbol name → MaterialIcons name mapping to `MAPPING` in `icon-symbol.tsx`.

Currently mapped: `house.fill`, `bell.fill`, `clock.fill`, `clock`, `gearshape.fill`, `wifi`, `arrow.clockwise`, `arrow.right`, `arrow.left`, `chevron.right`, `chevron.left`, `checkmark.circle.fill`, `checkmark.circle`, `flame.fill`, `lightbulb.fill`, `chart.line.uptrend.xyaxis`, `chart.bar.fill`, `location.fill`, `xmark.circle.fill`, `plus`, `minus`, `thermometer.medium`, `shield.fill`, `person.fill`, `envelope.fill`, `lock.fill`, `eye.fill`, `eye.slash.fill`, `cart.fill`, `shippingbox.fill`, `mappin`, `tag.fill`, `storefront.fill`, `line.3.horizontal`, `list.bullet`, `phone.fill`, `doc.fill`, `building.2.fill`, `hourglass`, `tray.fill`.

---

## Assets

| Path | Usage |
|---|---|
| `assets/images/onboarding-hero.jpg` | Background of onboarding slide 3 |
| `assets/images/6kg.png` | 6 kg cylinder image |
| `assets/images/12-5kg.png` | 12.5 kg cylinder image |
| `assets/images/50kg.png` | 50 kg cylinder image |

## Path alias

`@/` resolves to the project root. Use it for all imports instead of relative paths.

---

## Backend (`gas-monitor-backend/`)

Express + TypeScript server on **port 9000**.

### Stack
- **Express** — HTTP server
- **Prisma** + **PostgreSQL** — ORM and database
- **bcryptjs** — password hashing (10 salt rounds)
- **jsonwebtoken** — JWT access + refresh tokens
- **zod** — request body validation
- **axios** — HTTP client for Paystack API calls

### File structure
```
gas-monitor-backend/
  prisma/
    schema.prisma        # All models and enums
  src/
    index.ts             # Express entry; mounts all routers; raw-body middleware for webhook
    lib/
      jwt.ts             # signAccessToken, signRefreshToken, verify*, refreshTokenExpiresAt
      prisma.ts          # Prisma client singleton
      otp.ts             # generateOtp, hashOtp, otpExpiresAt (10 min TTL), OTP_MAX_ATTEMPTS (5)
      email.ts           # sendOtpEmail via Resend; logs to console instead if RESEND_API_KEY is unset
    middleware/
      authenticate.ts    # Bearer token guard → attaches req.user ({ sub, email })
    routes/
      auth.ts            # /api/auth/* endpoints
      vendor.ts          # /api/vendor/* endpoints (all require Bearer auth)
      cylinders.ts       # /api/cylinders/* endpoints
      orders.ts          # /api/orders/* endpoints (consumer orders + Paystack integration)
  .env                   # DATABASE_URL, JWT secrets, PAYSTACK_SECRET_KEY, RESEND_API_KEY, EMAIL_FROM, PORT
  .env.example           # Template (safe to commit)
```

### Prisma models & enums

**Enums:** `Role` (CONSUMER, VENDOR), `VendorStatus` (PENDING, APPROVED, REJECTED), `GasType` (COOKING, MEDICAL, INDUSTRIAL, BULK, OTHER), `OrderStatus` (PENDING, CONFIRMED, DELIVERED, CANCELLED), `OtpPurpose` (SIGNUP_VERIFICATION, PASSWORD_RESET)

| Model | Key fields |
|---|---|
| `User` | id, email (unique), name, password, **role**, **emailVerified**, otpCodeHash?, otpPurpose?, otpExpiresAt?, otpAttempts, refreshTokens, vendorProfile?, orders, cylinderProfiles |
| `RefreshToken` | id, token (unique), userId (FK cascade), expiresAt |
| `VendorProfile` | id, userId (unique FK), businessName, businessAddress, lat?, lng?, phone, **status** |
| `VendorDocument` | id, vendorId (FK), url, fileName |
| `GasListing` | id, vendorId (FK), gasType, customName?, pricePerKg, cylinderSizes[], otherSizes?, inStock |
| `CylinderProfile` | id, userId (FK), name, sizeKg, customSizeLabel?, imageKey, isActive |
| `Order` | id, consumerId (FK), vendorId? (FK), listingId? (FK), supplierName?, cylinderSize, quantity, totalAmount, deliveryAddress, status, paystackRef? (unique), paystackStatus? |

`vendorId` and `listingId` are nullable on `Order` — orders created through the consumer app before vendor/listing DB integration is complete will have these as null and use `supplierName` instead.

### API endpoints

**`/api/auth/`**

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | — | Body: `{ name, email, password, role? }`. Role defaults to CONSUMER. Creates an **unverified** user, emails a 6-digit OTP (10 min TTL), returns `{ message, email }` — no tokens |
| POST | `/verify-otp` | — | Body: `{ email, otp }`. Marks `emailVerified`, returns `{ user, accessToken, refreshToken }` like `/register` used to |
| POST | `/resend-otp` | — | Body: `{ email, purpose: 'SIGNUP_VERIFICATION' \| 'PASSWORD_RESET' }`. Always responds generically |
| POST | `/login` | — | Returns user with `role` + `vendorStatus`. `403 { code: 'EMAIL_NOT_VERIFIED' }` if not yet verified |
| POST | `/refresh` | — | Rotates token pair |
| POST | `/logout` | — | Deletes refresh token |
| GET | `/me` | Bearer | Returns user with `role` + `vendorStatus` |
| POST | `/forgot-password` | — | Body: `{ email }`. Always responds the same message regardless of whether the account exists (no enumeration); emails an OTP if it does |
| POST | `/reset-password` | — | Body: `{ email, otp, password }`. Verifies the OTP, updates the password, revokes all refresh tokens |

OTP codes are 6-digit, sha256-hashed at rest (`otpCodeHash`), expire after 10 minutes, and lock out after 5 wrong attempts (`otpAttempts`) — the caller must request a new one via `/resend-otp`. Outside `NODE_ENV=production`, OTP-issuing endpoints also return the raw `otp` in the response body so the flow is testable without a working Resend key.

**`/api/vendor/`** — all require Bearer token

| Method | Path | Notes |
|---|---|---|
| POST | `/profile` | Create/update vendor profile (upsert) |
| GET | `/me` | Get own profile + documents + listings |
| POST | `/documents` | Body: `{ documents: [{ url, fileName }] }` |
| GET | `/listings` | Own listings only |
| POST | `/listings` | Requires APPROVED status |
| PATCH | `/listings/:id` | Partial update, ownership checked |
| DELETE | `/listings/:id` | Ownership checked |
| GET | `/orders` | Incoming orders with consumer + listing data |
| PATCH | `/orders/:id` | Body: `{ status: CONFIRMED \| DELIVERED \| CANCELLED }` |

**`/api/orders/`** — all require Bearer token except webhook

| Method | Path | Notes |
|---|---|---|
| POST | `/initialize` | Body: `{ supplierName, cylinderSize, quantity, totalAmount, deliveryAddress }`. Creates `PENDING` order, calls Paystack initialize, returns `{ orderId, reference, authorizationUrl, amount, email }` |
| POST | `/verify` | Body: `{ reference }`. Verifies with Paystack; sets order status to `CONFIRMED` |
| GET | `/` | Consumer's own orders, newest first |
| GET | `/:id` | Single order (ownership checked) |
| POST | `/webhook` | Paystack webhook — HMAC-SHA512 signature verified; handles `charge.success` event |

### Paystack integration

- **Secret key** — `PAYSTACK_SECRET_KEY` in `.env` (use `sk_test_...` in dev, `sk_live_...` in prod)
- **Callback URL** — `https://4fgmonitor.app.local/payment-callback` (intercepted by the WebView, never actually loaded)
- **Reference format** — `4FG-{orderId}` (e.g. `4FG-uuid-here`)
- **Amount** — sent to Paystack in **kobo** (naira × 100)
- **Webhook** — mount order before `express.json()` middleware so raw body is available for HMAC verification; the `index.ts` conditionally applies `express.raw()` to `/api/orders/webhook`

### Token strategy
- **Access token:** 15 minutes, `JWT_ACCESS_SECRET`
- **Refresh token:** 7 days, `JWT_REFRESH_SECRET`, stored in `RefreshToken` table
- Rotation on refresh: old deleted, new pair issued
- On logout: refresh token deleted from DB + `clearSession()` clears SecureStore

### Environment variables (`.env`)
```
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=9000
PAYSTACK_SECRET_KEY=sk_test_...
RESEND_API_KEY=re_...          # optional in dev — OTPs log to console if unset
EMAIL_FROM="4FG Smart Gas Monitor <onboarding@resend.dev>"
```
