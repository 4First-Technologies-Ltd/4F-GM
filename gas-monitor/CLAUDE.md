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
npx prisma studio      # Open Prisma Studio (DB browser)
```

No test runner is configured yet.

## Architecture

This is an **Expo SDK 54** app using **expo-router** (file-based routing), React Native 0.81.5, and React 19 with the React Compiler and new architecture both enabled.

### Routing & Navigation flow

`app/` maps directly to URL routes. `unstable_settings.anchor = 'splash'` so the stack always starts at splash.

**Full user flow:**
```
splash.tsx → (checks token) → onboarding.tsx → sign-in.tsx or sign-up.tsx → (tabs)
```

Splash reads the stored access token via `getAccessToken()` — if a token exists it skips onboarding and goes straight to `/(tabs)`. All auth/onboarding → tabs transitions use `router.replace` (no back navigation into auth).

| File | Route | Notes |
|---|---|---|
| `app/splash.tsx` | `/splash` | Animated logo, token check, auto-navigates after 2.2s |
| `app/onboarding.tsx` | `/onboarding` | 3-slide horizontal paging carousel |
| `app/sign-in.tsx` | `/sign-in` | Email + password, calls `authApi.login()` |
| `app/sign-up.tsx` | `/sign-up` | Name + email + password, calls `authApi.register()` |
| `app/(tabs)/` | `/(tabs)` | Tab group — main app |
| `app/(tabs)/_layout.tsx` | — | `<Tabs>` navigator |
| `app/(tabs)/index.tsx` | `/(tabs)/` | Dashboard (Home) |
| `app/(tabs)/history.tsx` | `/(tabs)/history` | Usage history |
| `app/(tabs)/device.tsx` | `/(tabs)/device` | Sensor status |
| `app/(tabs)/settings.tsx` | `/(tabs)/settings` | Account & preferences, sign-out |
| `app/(tabs)/explore.tsx` | — | Hidden from tab bar (`href: null`) |
| `app/modal.tsx` | `/modal` | Presented modally |

Stack animation config: `splash` = none, `onboarding` = fade (gestureEnabled: false), `sign-in/sign-up` = slide_from_right, `(tabs)` = fade (gestureEnabled: false).

### Auth & Storage layer

**`lib/storage.ts`** — SecureStore helpers (uses `expo-secure-store`):
- Keys: `4fg_access_token`, `4fg_refresh_token`, `4fg_user`
- `saveSession(accessToken, refreshToken, user)` — persists all three
- `getAccessToken()` / `getRefreshToken()` / `getSavedUser<T>()` — typed reads
- `clearSession()` — deletes all three keys (called on sign-out)

**`lib/api.ts`** — Typed fetch wrapper + `authApi`:
```
API_BASE_URL:
  dev + Android  → http://10.0.2.2:9000   (emulator routes localhost to itself)
  dev + iOS/web  → http://localhost:9000
  production     → https://your-production-api.com
```

`authApi` methods (all save/clear session automatically):
| Method | Endpoint | Notes |
|---|---|---|
| `register(name, email, password)` | POST `/api/auth/register` | Calls `saveSession` |
| `login(email, password)` | POST `/api/auth/login` | Calls `saveSession` |
| `refresh()` | POST `/api/auth/refresh` | Rotates token pair, returns null on failure |
| `logout()` | POST `/api/auth/logout` | Revokes refresh token, always calls `clearSession` |
| `me()` | GET `/api/auth/me` | Requires Bearer token (`auth: true`) |

### Auth screens (`app/sign-in.tsx`, `app/sign-up.tsx`)

Both screens use `KeyboardAvoidingView` + `ScrollView` for keyboard handling. Shared `Field` component (local to each file) renders label + styled `TextInput` + optional password toggle + inline error. Validation runs on submit (not on keystroke).

- Button shows `ActivityIndicator` and is disabled during the API call
- A red `apiErrBox` banner appears above the button for server-side errors
- On success: `router.replace('/(tabs)')`

### Settings screen (`app/(tabs)/settings.tsx`)

Sign Out button triggers `Alert.alert` with a destructive confirm action. On confirm:
1. Sets `signingOut` state (shows `ActivityIndicator` on the button)
2. Calls `authApi.logout()` (revokes refresh token on server + clears SecureStore)
3. `router.replace('/sign-in')`

### Theming

`constants/theme.ts` exports `Colors` (light/dark token map), `StatusColors`, `SensorStatus` type, and `Fonts` (platform-specific font families). Hooks:
- `hooks/use-theme-color.ts` — resolves a token from `Colors` for the current scheme
- `hooks/use-color-scheme.ts` — re-exports RN's `useColorScheme`; `.web.ts` variant defaults to `'light'` until hydration
- `hooks/use-app-fonts.ts` — loads Fira Sans (400/500/700) and Fira Code (400/500/700) via `expo-font`

The root `_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` and gates rendering on `useAppFonts()`.

`utils/sensor-status.ts` exports `getSensorStatus`, `getStatusColor`, `getStatusLabel` helpers.

Themed primitives (`ThemedText`, `ThemedView`) accept optional `lightColor`/`darkColor` overrides.

### App-wide color palette (light green theme)

All tab screens share a consistent light green palette defined locally as `const C = { ... }` in each file:

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

Tab bar: white bg (`#FFFFFF`), `#2D7450` active, `#9EBA9E` inactive.

Onboarding/auth screens use a separate `C` palette with `greenBright: '#22C55E'` for CTAs on dark backgrounds and `greenDark: '#1A4730'` for the hero overlay.

### Dashboard screen (`app/(tabs)/index.tsx`)

The main screen has two visual zones:
1. **Top section** (`#EDF7ED` bg): app header, segmented arc gauge, status badge, action buttons
2. **White content card** (`#FFFFFF`, `borderTopLeftRadius: 28`, `marginTop: -28`): stats row, AI insights, refill reminder, demo controls

**Segmented Arc Gauge (`GaugeRing` component):**
- 48 rectangular bars (7×18px, `borderRadius: 2`) arranged in a 300° arc (classic fuel gauge shape)
- Arc starts at 210° (7 o'clock = empty) and ends at 150° (5 o'clock = full)
- Bar color gradient via `getBarColor(t)` using iOS-style stops: `#FF3B30` → `#FF9500` → `#FFCC00` → `#4CD964` → `#34C759`
- Active bars (up to current `gasLevel` percentage): full color; inactive bars: `#C2D9C2`
- Inner white disk displays `%`, "Gas Level" label (colored by current level), and `kg` reading
- `gasLevel` starts at `useState(100)` — replace with live sensor value when available

**`getStatus(pct)`** returns a label and color:
- ≤10%: `#FF3B30` "Critical — Refill Now"
- ≤25%: `#FF9500` "Low — Order Soon"
- ≤60%: `#CC9A00` "Moderate Level"
- \>60%: `#34C759` "Good Level"

**Simulate Drain (demo):**
- `startDrain()` animates `gasLevel` 100→0 in 100 steps × 240ms (~24s)
- Uses `setInterval` via `simRef` (ref, not state) to avoid stale closures
- Button flips to "■ Stop" with red bg while simulating; ↺ resets to 100%
- On press, `scrollRef.current?.scrollTo({ y: gaugeY.current })` auto-scrolls to the gauge
- `gaugeY` is captured via `onLayout` on the gauge wrapper View

**Refill Reminder:**
- When `reminderSet === false`: shows a 4-option time picker grid + "Get Reminder" button
- When `reminderSet === true`: shows "Reminder Active" state — checkmark circle, bold title, clock icon + "Notify me [selectedReminder] before empty", "Cancel reminder" underlined link

### Onboarding screen (`app/onboarding.tsx`)

3-slide horizontal `ScrollView` with `pagingEnabled`. Slide index tracked via `onMomentumScrollEnd`.

| Slide | Content | Background |
|---|---|---|
| 1 | `IllustrationMonitor` — 6 green icon circles around central 4FG device mockup | White |
| 2 | `IllustrationAlerts` — styled alert card + green confirm circle | White |
| 3 | Brand logo, title, body, CTA | `assets/images/onboarding-hero.jpg` (gas cylinder photo) with `rgba(0,10,5,0.62)` overlay |

Dot indicator: inactive = `#D1E8D1` 8×8 circle; active = `#2D7450` 20×8 pill (or `#22C55E` on hero slide).

### Platform-specific files

- `components/ui/icon-symbol.ios.tsx` — SF Symbols via `expo-symbols` (accepts any valid SF Symbol name)
- `components/ui/icon-symbol.tsx` — `@expo/vector-icons/MaterialIcons` fallback for Android/web

**When adding a new icon:** add the SF Symbol name → MaterialIcons name mapping to `MAPPING` in `icon-symbol.tsx`. Currently mapped: `house.fill`, `bell.fill`, `clock.fill`, `clock`, `gearshape.fill`, `wifi`, `arrow.clockwise`, `arrow.right`, `arrow.left`, `chevron.right`, `chevron.left`, `checkmark.circle.fill`, `checkmark.circle`, `flame.fill`, `lightbulb.fill`, `chart.line.uptrend.xyaxis`, `chart.bar.fill`, `location.fill`, `xmark.circle.fill`, `plus`, `minus`, `thermometer.medium`, `shield.fill`, `person.fill`, `envelope.fill`, `lock.fill`, `eye.fill`, `eye.slash.fill`.

### Assets

| Path | Usage |
|---|---|
| `assets/images/onboarding-hero.jpg` | Background of onboarding slide 3 (gas cylinder photo) |

### Path alias

`@/` resolves to the project root. Use it for all imports instead of relative paths.

---

## Backend (`gas-monitor-backend/`)

Express + TypeScript server on **port 9000**. Lives in a sibling directory next to `gas-monitor/`.

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
    schema.prisma        # User + RefreshToken models
  src/
    index.ts             # Express entry, port 9000
    lib/
      jwt.ts             # signAccessToken, signRefreshToken, verify*, refreshTokenExpiresAt
      prisma.ts          # Prisma client singleton (global cache for dev hot-reload)
    middleware/
      authenticate.ts    # Bearer token guard → attaches req.user (ApiUser)
    routes/
      auth.ts            # All /api/auth/* endpoints
  .env                   # DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PORT
  .env.example           # Template (safe to commit)
```

### Prisma models
- **`User`** — id (uuid), email (unique), name, password (hashed), createdAt, updatedAt, refreshTokens
- **`RefreshToken`** — id, token (unique), userId (FK → User, cascade delete), expiresAt, createdAt

### API endpoints (`/api/auth/`)

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/register` | — | `{ name, email, password }` | Creates user, issues token pair |
| POST | `/login` | — | `{ email, password }` | Verifies password, issues token pair |
| POST | `/refresh` | — | `{ refreshToken }` | Rotates token pair (old deleted, new issued) |
| POST | `/logout` | — | `{ refreshToken }` | Deletes refresh token from DB, always succeeds |
| GET | `/me` | Bearer | — | Returns user object for current token |

### Token strategy
- **Access token:** 15 minutes, signed with `JWT_ACCESS_SECRET`
- **Refresh token:** 7 days, signed with `JWT_REFRESH_SECRET`, stored in `RefreshToken` table
- On refresh: old token deleted, new pair issued (rotation — prevents reuse)
- On logout: refresh token deleted from DB; `clearSession()` removes both tokens from SecureStore

### Environment variables (`.env`)
```
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=9000
```
