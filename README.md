# 4FG Smart Gas Monitor

A full-stack mobile platform that lets consumers monitor their cooking gas levels in real time, receive AI-powered refill predictions, and order gas from nearby vendors — all from their smartphones.

---

## Overview

The system has three parts that work together:

| Part | Stack | Purpose |
|------|-------|---------|
| **Mobile App** | React Native (Expo SDK 54), TypeScript | Consumer and vendor mobile experience |
| **Backend API** | Express.js, TypeScript, PostgreSQL, Prisma | REST API, auth, payments |
| **Landing Page** | HTML/JS, Supabase Edge Functions | Waitlist capture and email confirmation |

---

## Features

- Real-time gas level arc gauge (0–100%) with color-coded status
- AI-powered "days until refill" prediction
- Smart refill reminders with configurable threshold
- Vendor marketplace — browse and order gas from nearby suppliers
- Paystack payment integration
- Role-based flows: Consumer and Vendor
- JWT authentication with silent token refresh and encrypted local storage
- Vendor account approval workflow with document upload

---

## Project Structure

```
4FG-MONITOR/
├── gas-monitor/              # Expo React Native app
├── gas-monitor-backend/      # Express + Prisma API server
├── landing/                  # Marketing site + waitlist admin
├── supabase/functions/       # Serverless edge functions (email)
└── screenshots/              # App screenshots
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Expo CLI (`npm install -g expo-cli`)
- A [Paystack](https://paystack.com) account (test keys are fine for development)

---

### 1. Backend

```bash
cd gas-monitor-backend
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

**.env variables:**

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/gas_monitor_db"
JWT_ACCESS_SECRET="your-long-random-secret"
JWT_REFRESH_SECRET="your-other-long-random-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=9000
NODE_ENV="development"
PAYSTACK_SECRET_KEY="sk_test_..."
```

Run migrations and start the dev server:

```bash
npm run db:push       # sync schema to your DB
npm run db:generate   # generate Prisma client
npm run dev           # starts on port 9000 with hot reload
```

Other useful backend scripts:

```bash
npm run build         # compile TypeScript → dist/
npm start             # run compiled production build
npm run db:migrate    # run Prisma migrations
npm run db:studio     # open Prisma Studio at localhost:5555
npm run db:reset      # wipe and re-seed the database
```

---

### 2. Mobile App

```bash
cd gas-monitor
npm install
npm run start         # open Expo dev server
```

Then press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with Expo Go.

The API URL is platform-detected in [gas-monitor/lib/api.ts](gas-monitor/lib/api.ts):

- Android emulator: `http://10.0.2.2:9000`
- iOS simulator / web: `http://localhost:9000`
- Production: update the `production` entry in that file

Other mobile scripts:

```bash
npm run android   # launch on Android emulator
npm run ios       # launch on iOS simulator
npm run web       # open in browser
npm run lint      # ESLint check
```

---

## API Reference

### Auth — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create a new consumer account |
| POST | `/login` | Sign in, returns user + token pair |
| POST | `/refresh` | Rotate access + refresh tokens |
| POST | `/logout` | Revoke refresh token |
| GET | `/me` | Get authenticated user profile |

### Vendor — `/api/vendor` (Bearer required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/profile` | Create or update vendor profile |
| GET | `/me` | Vendor profile with listings + docs |
| POST | `/documents` | Upload verification documents |
| GET | `/listings` | List own gas listings |
| POST | `/listings` | Create listing (approved vendors only) |
| PATCH | `/listings/:id` | Update listing |
| DELETE | `/listings/:id` | Delete listing |
| GET | `/orders` | Incoming orders |
| PATCH | `/orders/:id` | Update order status |

### Orders — `/api/orders`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/initialize` | Initiate Paystack payment |
| POST | `/verify` | Verify payment after redirect |
| POST | `/webhook` | Paystack webhook handler |

### Cylinders — `/api/cylinders` (Bearer required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List cylinder profiles |
| POST | `/` | Create a cylinder profile |
| PATCH | `/:id` | Update a cylinder profile |
| DELETE | `/:id` | Delete a cylinder profile |
| PATCH | `/:id/activate` | Set as the active cylinder |

---

## Database Schema

Eight Prisma models connected across a full order lifecycle:

```
User ──< RefreshToken
User ──< VendorProfile ──< VendorDocument
                        ──< GasListing
User ──< CylinderProfile
User ──< Order ──> VendorProfile
               ──> GasListing
```

Key enums: `Role` (CONSUMER, VENDOR), `VendorStatus` (PENDING, APPROVED, REJECTED), `OrderStatus` (PENDING, CONFIRMED, DELIVERED, CANCELLED), `GasType` (COOKING, MEDICAL, INDUSTRIAL, BULK, OTHER).

---

## Authentication

Access tokens expire in 15 minutes. Refresh tokens last 7 days and are stored in both the database and the device's encrypted SecureStore. The mobile app performs a silent token refresh automatically on a 401 response and stores nothing sensitive in AsyncStorage.

---

## Design Tokens

| Token | Value |
|-------|-------|
| Background | `#EDF7ED` |
| Primary text | `#1A2E1A` |
| Accent / CTA | `#2D7450` |
| Danger | `#D32F2F` |
| Font | Fira Sans (UI), Fira Code (numeric readouts) |

Full design system: [gas-monitor/design-system/MASTER.md](gas-monitor/design-system/MASTER.md)

---

## Roadmap

- [ ] Hardware sensor integration (IoT → backend → mobile)
- [ ] Push notifications for refill thresholds
- [ ] Real usage history charts
- [ ] Production deployment (API, DB, mobile build)

---

## Contributing

See [gas-monitor/CLAUDE.md](gas-monitor/CLAUDE.md) for development conventions, routing tables, component specs, and the vendor sign-up flow architecture.
