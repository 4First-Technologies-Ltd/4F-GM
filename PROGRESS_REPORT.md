# 4FG Smart Gas Monitor — Project Progress Report
**Date:** April 23, 2026
**Prepared for:** 4FG Team

---

## Overview

We have successfully built the **4FG Smart Gas Monitor** — a mobile application and supporting server system that allows users to monitor their cooking gas levels in real time from their smartphones. The app is connected to a secure cloud backend and is ready for integration with physical gas sensor hardware.

---

## What We Built

The project is made up of two parts that work together:

| Part | What it is |
|---|---|
| **Mobile App** | The app users install on their phones (iOS & Android) |
| **Backend Server** | The secure cloud system that stores accounts and handles logins |

---

## The User Journey

Here is how a new user experiences the app from first launch to daily use:

```
┌─────────────────────────────────────────────────────────┐
│                    FIRST TIME USER                       │
└─────────────────────────────────────────────────────────┘

         ┌──────────────┐
         │  App Opens   │
         │ (Splash Logo │
         │  Animation)  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │  Onboarding  │  ◄── 3 slides explaining the app
         │   Screens    │
         └──────┬───────┘
                │
        ┌───────┴────────┐
        ▼                ▼
  ┌──────────┐    ┌──────────────┐
  │ Sign In  │    │  Create      │
  │          │    │  Account     │
  └─────┬────┘    └──────┬───────┘
        └────────┬────────┘
                 │
                 ▼
         ┌──────────────┐
         │  Main App    │  ◄── Stays logged in automatically
         │  Dashboard   │
         └──────────────┘


┌─────────────────────────────────────────────────────────┐
│                  RETURNING USER                          │
└─────────────────────────────────────────────────────────┘

         ┌──────────────┐
         │  App Opens   │
         └──────┬───────┘
                │
                ▼  (token found — skip login)
         ┌──────────────┐
         │  Main App    │  ◄── Goes straight here
         │  Dashboard   │
         └──────────────┘
```

---

## The Screens — What Each One Does

### 1. Splash Screen
The first thing users see when they open the app. The **4FG logo** animates in with a smooth spring effect. While this plays, the app silently checks if the user is already logged in. If yes, it skips straight to the dashboard. The whole animation takes 2.2 seconds.

### 2. Onboarding (3 Slides)
Shown only to first-time users. Three beautiful screens that explain the app:

| Slide | Topic |
|---|---|
| 1 | **Monitor Your Gas** — introduces the device with illustrated icons |
| 2 | **Smart Alerts** — shows how refill notifications work |
| 3 | **Get Started** — full-screen gas cylinder photo with a call-to-action button |

### 3. Sign Up Screen
New users create an account by entering their name, email, and a password. The form validates entries (e.g. checks the email format, ensures password is at least 6 characters) and shows clear, friendly error messages. On success, the user lands directly on the dashboard.

### 4. Sign In Screen
Returning users log in with their email and password. Includes a "Forgot password?" link (ready for future activation). Error messages display clearly if credentials are wrong.

---

## Inside the Main App

Once logged in, the app has **four main sections** accessible from the bottom navigation bar:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   [ Home ]  [ History ]  [ Device ]  [ Settings ]  │
│      ●                                              │
└─────────────────────────────────────────────────────┘
```

### Home — Dashboard
The heart of the app. Shows everything at a glance:

```
┌─────────────────────────────────┐
│         4FG Monitor             │
│                                 │
│     ╔═══════════════╗           │
│    ╔╝               ╚╗          │
│   ║   ██████░░░░░░   ║         │
│   ║      72%         ║         │
│    ╚╗   Gas Level  ╔╝          │
│     ╚═══════════════╝           │
│        4.7 kg remaining         │
│                                 │
│  ┌─────────┐  ┌──────────────┐ │
│  │ Good    │  │ Simulate     │ │
│  │ Level ✓ │  │ Drain (demo) │ │
│  └─────────┘  └──────────────┘ │
│                                 │
│  ┌──────────────────────────┐  │
│  │  AI Insights             │  │
│  │  "At this rate, refill   │  │
│  │   needed in ~12 days"    │  │
│  └──────────────────────────┘  │
│                                 │
│  ┌──────────────────────────┐  │
│  │  Refill Reminder         │  │
│  │  Set a reminder alert    │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

**Key features on the dashboard:**

- **Arc Gauge** — A beautiful semicircular gauge (like a car fuel meter) that shows gas level from 0–100%. The colour changes automatically:
  - Green → Good level (above 60%)
  - Yellow → Moderate (25–60%)
  - Orange → Low, order soon (10–25%)
  - Red → Critical, refill now (below 10%)

- **AI Insights** — A smart text card that estimates days remaining based on usage patterns.

- **Refill Reminder** — Users can set a reminder to be notified before the gas runs out. Options: 1 day, 3 days, 1 week, or 2 weeks before empty. Once set, it shows a clear "Reminder Active" confirmation with a green checkmark.

- **Demo Mode** — A "Simulate Drain" button for testing and demonstrations. It animates the gauge from 100% to 0% so the team can showcase the app without needing physical hardware.

### History
Tracks past gas usage over time (screen in place, data integration pending).

### Device
Shows the status and connection details of the physical sensor device (screen in place, hardware integration pending).

### Settings
Account management screen with:
- User profile display
- Push notification toggle
- Email alert toggle
- Measurement unit selector (kg or lbs)
- App version and device info
- **Sign Out button** — asks for confirmation before signing out, then securely clears all credentials from the phone

---

## The Backend — What Happens Behind the Scenes

The app is powered by a secure server that runs the following system:

```
┌──────────────────────────────────────────────────────────┐
│                    USER'S PHONE                          │
│                                                          │
│   Sign Up / Sign In  ──────────────────────────────────► │
│                                                          │
│   ◄──────────────────────  Access Token (15 min)         │
│   ◄──────────────────────  Refresh Token (7 days)        │
│                                                          │
│   Stored securely in phone's encrypted storage           │
└──────────────────────┬───────────────────────────────────┘
                       │ Every app request includes token
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   BACKEND SERVER                         │
│                   (Port 9000)                            │
│                                                          │
│   ┌────────────┐    ┌───────────────┐   ┌─────────────┐ │
│   │  Validates │    │  Checks       │   │  Returns    │ │
│   │  Token     │───►│  Database     │──►│  User Data  │ │
│   └────────────┘    └───────────────┘   └─────────────┘ │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   DATABASE                               │
│                   (PostgreSQL)                           │
│                                                          │
│   Users Table          │   Sessions Table               │
│   ───────────────────  │   ──────────────────           │
│   ID                   │   Token                        │
│   Name                 │   User ID                      │
│   Email                │   Expiry Date                  │
│   Password (encrypted) │                                │
└──────────────────────────────────────────────────────────┘
```

**Key security features:**
- Passwords are **never stored as plain text** — they are encrypted using industry-standard hashing before saving
- Login sessions use **two tokens**: a short-lived access token (expires in 15 minutes) and a longer refresh token (expires in 7 days)
- When a user signs out, their session token is **deleted from the database** — not just from the phone
- All token storage on the phone uses the device's **secure encrypted storage** (not regular app storage)

---

## Design & Visual Identity

The app uses a consistent **light green theme** throughout, reinforcing the eco-friendly / safety brand identity:

| Colour | Use |
|---|---|
| `#EDF7ED` — Soft green | Page backgrounds |
| `#2D7450` — Forest green | Buttons, active states, logo |
| `#1A2E1A` — Deep green | Main text |
| `#D32F2F` — Red | Danger alerts, sign out, critical gas level |
| `#FFFFFF` — White | Cards, content surfaces |

Typography uses **Fira Sans** (clean, modern, readable) for the interface and **Fira Code** for numerical/data displays.

---

## How It All Connects

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   PHYSICAL SENSOR  ──► (future integration)                │
│        │                                                    │
│        ▼                                                    │
│   MOBILE APP  ◄────────────────►  BACKEND SERVER           │
│   (Expo / React Native)          (Express / Node.js)       │
│        │                                  │                 │
│        │                                  ▼                 │
│        │                         PostgreSQL Database        │
│        │                                                    │
│        ▼                                                    │
│   USER'S SCREEN                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary of Achievements

| Area | Status |
|---|---|
| Mobile app structure & navigation | ✅ Complete |
| Splash screen with animation | ✅ Complete |
| Onboarding carousel (3 slides) | ✅ Complete |
| Sign Up screen | ✅ Complete |
| Sign In screen | ✅ Complete |
| Dashboard with arc gauge | ✅ Complete |
| Gas level colour coding | ✅ Complete |
| AI insights card | ✅ Complete |
| Refill reminder system | ✅ Complete |
| Demo/simulate drain mode | ✅ Complete |
| History screen | ✅ Shell ready |
| Device status screen | ✅ Shell ready |
| Settings screen | ✅ Complete |
| Sign Out (secure) | ✅ Complete |
| Backend server | ✅ Complete |
| User registration API | ✅ Complete |
| Login / logout API | ✅ Complete |
| Secure token system | ✅ Complete |
| Database schema | ✅ Complete |
| Code pushed to GitHub | ✅ Complete |

---

## What Comes Next

1. **Hardware Integration** — Connect the physical gas sensor so the gauge reads live data
2. **Push Notifications** — Wire up the refill reminder to actually send alerts to the user's phone
3. **Usage History** — Populate the History screen with real consumption data from the sensor
4. **Order Screen** — Connect to order screen when someone clicks on  get refill
5. **Forgot Password** — Complete the password reset flow
6. **Production Deployment** — Deploy the backend to a live server and update the app's API URL

---

*Report generated from the 4FG Monitor codebase — Bubble Barrel Engineering Team*
