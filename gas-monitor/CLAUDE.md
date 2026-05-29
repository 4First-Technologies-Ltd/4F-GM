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
npm run dev            # Start Express server with ts-node-dev (hot reload, port 9000)
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
| Consumer | `CONSUMER` | Monitors gas level, browses vendors, places orders |
| Vendor | `VENDOR` | Lists gas products, receives and manages orders, paid via Paystack |

Role is stored on `User.role` in the database and in SecureStore as part of the saved user object. All role-based routing reads `getSavedUser<ApiUser>()` after login — never hardcode `/(tabs)` as the post-login destination.

---

## Routing & Navigation

`app/` maps directly to URL routes. `unstable_settings.anchor = 'splash'` so the stack always starts at splash.

### Full user flow

```
splash.tsx
  ├── no token → /onboarding
  │     └── role picker (slide 3) → /sign-up (consumer) | /vendor-sign-up (vendor)
  └── token exists → check role
        ├── CONSUMER → /(tabs)
        └── VENDOR
              ├── APPROVED → /(vendor)
              └── PENDING/REJECTED → /vendor-pending
```

Sign-in applies the same role check after `authApi.login()` resolves.

### Route table

| File | Route | Notes |
|---|---|---|
| `app/splash.tsx` | `/splash` | Animated logo, token + role check, auto-navigates after 2.2s |
| `app/onboarding.tsx` | `/onboarding` | 3-slide carousel; slide 3 shows role picker cards |
| `app/sign-in.tsx` | `/sign-in` | Email + password; routes to `/(tabs)` or `/(vendor)` based on role |
| `app/sign-up.tsx` | `/sign-up` | Consumer registration → `/(tabs)` |
| `app/vendor-sign-up.tsx` | `/vendor-sign-up` | 3-step vendor registration → `/vendor-pending` |
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
| `app/order.tsx` | `/order` | Consumer order flow (presented from consumer dashboard) |
| `app/modal.tsx` | `/modal` | Generic modal |

Stack animation config: `splash` = none, `onboarding` = fade (gestureEnabled: false), `sign-in/sign-up/vendor-sign-up` = slide_from_right, `vendor-pending/(tabs)/(vendor)` = fade (gestureEnabled: false).

---

## Vendor sign-up (`app/vendor-sign-up.tsx`)

3-step form with a progress indicator:

| Step | Fields |
|---|---|
| 1 — Account | Personal name, business name, email, password |
| 2 — Business | Phone number, business address (multiline), GPS location (optional) |
| 3 — Verify | Identity document upload via `expo-image-picker` (skip allowed) |

On submit (step 3), three sequential API calls are made:
1. `authApi.register(name, email, password, 'VENDOR')` — creates user + saves session
2. `vendorApi.createProfile(...)` — creates `VendorProfile` (status = PENDING)
3. `vendorApi.uploadDocuments(...)` — only if files were selected

After submit → `router.replace('/vendor-pending')`.

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
| `register(name, email, password, role?)` | POST `/api/auth/register` | `role` defaults to `'CONSUMER'`; calls `saveSession` |
| `login(email, password)` | POST `/api/auth/login` | Calls `saveSession`; response includes `role` + `vendorStatus` |
| `refresh()` | POST `/api/auth/refresh` | Rotates token pair, returns null on failure |
| `logout()` | POST `/api/auth/logout` | Revokes refresh token, always calls `clearSession` |
| `me()` | GET `/api/auth/me` | Returns full user including `role` + `vendorStatus` |

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

**`sign-up.tsx`** — Consumer only. On success: `router.replace('/(tabs)')`.

**`vendor-sign-up.tsx`** — Vendor only. On success: `router.replace('/vendor-pending')`.

Both auth screens use `KeyboardAvoidingView` + `ScrollView`. Shared local `Field` component renders label + styled `TextInput` + optional password toggle + inline error. Validation runs on submit.

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

Tab bar (consumer): white bg, `#2D7450` active, `#9EBA9E` inactive.

Onboarding/auth screens use a separate `C` palette with `greenBright: '#22C55E'` and `greenDark: '#1A4730'`.

---

## Consumer dashboard (`app/(tabs)/index.tsx`)

Two visual zones:
1. **Top** (`#EDF7ED`): app header, segmented arc gauge, status badge, action buttons
2. **White card** (`borderTopLeftRadius: 28`, `marginTop: -28`): stats row, AI insights, refill reminder, demo controls

**Segmented Arc Gauge (`GaugeRing`):** 48 bars in a 300° arc. `gasLevel` is `useState(100)` — replace with live sensor value when backend sensor data is wired up.

**Refill Reminder:** time picker grid (4 options) → "Reminder Active" state with cancel link.

**Simulate Drain:** animates `gasLevel` 100→0 over ~24s via `setInterval` ref. Auto-scrolls to gauge on start.

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

Currently mapped: `house.fill`, `bell.fill`, `clock.fill`, `clock`, `gearshape.fill`, `wifi`, `arrow.clockwise`, `arrow.right`, `arrow.left`, `chevron.right`, `chevron.left`, `checkmark.circle.fill`, `checkmark.circle`, `flame.fill`, `lightbulb.fill`, `chart.line.uptrend.xyaxis`, `chart.bar.fill`, `location.fill`, `xmark.circle.fill`, `plus`, `minus`, `thermometer.medium`, `shield.fill`, `person.fill`, `envelope.fill`, `lock.fill`, `eye.fill`, `eye.slash.fill`, `cart.fill`, `shippingbox.fill`, `mappin.fill`, `tag.fill`, `storefront.fill`, `line.3.horizontal`, `list.bullet`, `phone.fill`, `doc.fill`, `building.2.fill`, `hourglass`, `tray.fill`.

---

## Assets

| Path | Usage |
|---|---|
| `assets/images/onboarding-hero.jpg` | Background of onboarding slide 3 |

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

### File structure
```
gas-monitor-backend/
  prisma/
    schema.prisma        # All models and enums
  src/
    index.ts             # Express entry, mounts /api/auth and /api/vendor
    lib/
      jwt.ts             # signAccessToken, signRefreshToken, verify*, refreshTokenExpiresAt
      prisma.ts          # Prisma client singleton
    middleware/
      authenticate.ts    # Bearer token guard → attaches req.user ({ sub, email })
    routes/
      auth.ts            # /api/auth/* endpoints
      vendor.ts          # /api/vendor/* endpoints (all require Bearer auth)
  .env                   # DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PORT
  .env.example           # Template (safe to commit)
```

### Prisma models & enums

**Enums:** `Role` (CONSUMER, VENDOR), `VendorStatus` (PENDING, APPROVED, REJECTED), `GasType` (COOKING, MEDICAL, INDUSTRIAL, BULK, OTHER), `OrderStatus` (PENDING, CONFIRMED, DELIVERED, CANCELLED)

| Model | Key fields |
|---|---|
| `User` | id, email (unique), name, password, **role**, refreshTokens, vendorProfile?, orders |
| `RefreshToken` | id, token (unique), userId (FK cascade), expiresAt |
| `VendorProfile` | id, userId (unique FK), businessName, businessAddress, lat?, lng?, phone, **status** |
| `VendorDocument` | id, vendorId (FK), url, fileName |
| `GasListing` | id, vendorId (FK), gasType, customName?, pricePerKg, cylinderSizes[], otherSizes?, inStock |
| `Order` | id, consumerId (FK), vendorId (FK), listingId (FK), cylinderSize, quantity, totalAmount, deliveryAddress, status, paystackRef? |

### API endpoints

**`/api/auth/`**

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | — | Body: `{ name, email, password, role? }`. Role defaults to CONSUMER |
| POST | `/login` | — | Returns user with `role` + `vendorStatus` |
| POST | `/refresh` | — | Rotates token pair |
| POST | `/logout` | — | Deletes refresh token |
| GET | `/me` | Bearer | Returns user with `role` + `vendorStatus` |

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
```
