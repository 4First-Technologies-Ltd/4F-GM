# 4FG Device ↔ App Integration Design

**Status:** proposal, supersedes section 5 of `DEVICE_INTEGRATION_HANDOVER.md` (the facts in that file about today's USSD/SMS behaviour still hold).
**Audience:** firmware engineer, backend and app developers.
**Priority:** 4G modem device first; the USSD/SMS device is supported as a reduced profile (section 9).

---

## 1. What the product page promises, and what each promise needs

| Promise (4fgmonitor.com) | What it needs from the system |
|---|---|
| Real-time gas level, as a percentage **and** estimated kg | Device weight → net gas → percent. Needs the cylinder's empty weight and nominal fill |
| Low-gas alerts, "thresholds you can set yourself", before it becomes an emergency | A rules engine on the server, user-set threshold, push plus fallbacks, no missed or repeated alerts |
| Usage analytics: daily consumption, refill patterns | Stored reading history and server-side consumption maths |
| "Forecasts from your actual usage pattern" | Consumption model → "days left" |
| Accurate weight sensing, "not guesswork" | Stable, temperature-compensated readings; noise filtered on the device |
| Check from anywhere (mobile + web) | Cloud as the single source of truth; both clients read the same API |
| "Connect your account… household, facility, or restaurant can see the same live reading" | Device linked to an account, shared with other members |
| Order from verified vendors, delivery tracking, in-app payment | Already built. Needs a trigger from the device side |
| "Ask before ordering, or reorder automatically when the level crosses the threshold" | A reorder policy per device, plus a way to charge without the checkout screen |
| Works with common LPG cylinders, no valve modification | Many sizes (6, 12.5, 50 kg and others); cylinder swaps must be handled gracefully |

## 2. The one design idea

**Keep the device dumb and the cloud smart.**

The device measures, filters, timestamps and reports **facts**. Everything the user sees (percent, kg left, days left, alerts, "unusual usage", reorder) is computed on the server from those facts. Reasons:

- Rules, thresholds and forecasts change weekly; firmware changes yearly and is hard to reach outdoors.
- A bug in alert logic is a server redeploy, not a recall.
- The same readings serve the gauge, the analytics, the alerts and the reorder trigger. One pipeline, not four features.

A **device shadow** pattern ties it together: the server keeps a *desired* configuration for each device and the device reports the version it has *applied*. The app shows "applied" or "pending" accordingly.

```
                        ┌──────────────────────── 4FG backend (Express/Prisma/Postgres) ───────────────────────┐
 ┌──────────────┐  HTTPS │ ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌───────────────────┐ │
 │ 4G device    ├───────►│ │ Ingest    ├─►│ Readings  ├─►│ Derivation ├─►│ Rules /  ├─►│ Notifier          │ │  push / in-app /
 │ (sleeps)     │◄───────┤ │ + auth    │  │ + events  │  │ net, %, ETA│  │ alerts   │  │ push·in-app·SMS   ├─┼► email / SMS
 └──────▲───────┘ config │ └───────────┘  └───────────┘  └────────────┘  └────┬─────┘  └───────────────────┘ │
        │ wake SMS       │        ▲ desired/applied config                     │ LOW / EMPTY                   │
        │ (optional)     │ ┌──────┴────┐                                   ┌────▼──────────┐                    │
 ┌──────┴───────┐        │ │ Device    │                                   │ Reorder       │──► existing orders │
 │ Termii SMS   │◄───────┤ │ shadow    │                                   │ policy engine │    + Paystack      │
 └──────────────┘        │ └───────────┘                                   └───────────────┘                    │
                         └───────────────────────────────▲──────────────────────────────────────────────────────┘
                                                         │ REST (same API for both clients)
                                              Mobile app (Expo)  ·  Website (Next.js)
```

## 3. The hard trade-off: "real-time" versus battery

A device on D-cells that sleeps cannot be contacted on demand, and a 4G modem that stays attached to the network will flatten the cells in weeks. "Real-time" therefore has to mean something specific. Proposed definition:

| Mode | Behaviour | Trigger |
|---|---|---|
| **Heartbeat** | Report every 1 to 6 h (server-adjustable) | Timer |
| **Change-driven** | Report as soon as the gas level moves by more than a set step (for example 0.5 kg) | Device |
| **Event** | Report at once on `LOW_GAS`, `EMPTY`, `CYLINDER_CHANGED`, tamper, low battery | Device |
| **Refresh now** | User taps pull-to-refresh and gets a fresh reading in seconds | App → server → **wake SMS** |

"Refresh now" is what delivers the *feeling* of live without a permanently attached modem: the server sends a short SMS through Termii (infrastructure we already pay for and operate); the modem's SMS wake-up line starts the MCU, which connects and reports. The app shows the last reading with its age ("updated 2 h ago") and a refresh action. Rate-limit refresh per device, as the SMS path already does.

**Decision needed from you (it changes the whole power design):**

| Option | Result |
|---|---|
| A. Battery only | Longest install flexibility; "live" is the table above. Must verify battery life with the modem's real current draw |
| B. Mains / USB adapter with battery backup | True always-on, MQTT/push possible, can report every minute while gas is in use. Kitchen installs usually have a socket; outdoor ones may not |
| C. Both SKUs | A battery SKU for outdoor cages, a powered SKU for kitchens and restaurants |

Our recommendation is **C**, with one firmware and one protocol. The protocol below works for both; the powered SKU simply uses a shorter `reportEverySec`.

**Modem class:** confirm network coverage and carrier support with the SIM provider before choosing. LTE Cat-M1/NB-IoT would be best for battery but availability from Nigerian carriers must be verified; LTE Cat-1(bis) with 2G fallback is the safer coverage choice at a higher energy cost.

## 4. Responsibilities

| Concern | Device | Server | App |
|---|---|---|---|
| Counts → kg (factory calibration, temperature compensation) | **Owns** | Stores calibration version | – |
| Noise filtering, "settled" detection | **Owns** | – | – |
| Tare of the platform | Executes on command | Issues, records result | Button |
| Cylinder empty weight, nominal fill | – | **Owns** | User picks a cylinder |
| Net gas, percent, kg left | – | **Owns** | Displays |
| Consumption, forecast, days left | – | **Owns** | Displays |
| Alert decisions and de-duplication | Raises edge events only | **Owns** | Displays, user sets thresholds |
| Notifying the user | – (SMS fallback only, see 8.4) | **Owns** | Receives |
| Reorder decision | – | **Owns** | User policy |
| Scheduling (report interval, wake steps) | Obeys, within safe limits | Sets via config | – |

## 5. Weight to gas: how accuracy is achieved

```
grossKg (device, settled, temperature-compensated)
  − platformTare            (device-side zero; recorded at install / TARE)
  = cylinderPlusGas
  − cylinderEmptyWeight     (the "TW" stamped on the cylinder collar; or learned, see below)
  = netGasKg
percent = netGasKg / nominalFillKg      (from the cylinder size the user selected)
```

- The app already has a `CylinderProfile` (size, name) per user. A device is linked to **one active cylinder profile**, which supplies `nominalFillKg`.
- **Empty weight:** the user can type the stamped TW, but cylinders vary and people misread them. Better, **auto-learn**: when the server sees a `CYLINDER_CHANGED` (a large step up in weight), it asks "Did you just fit a full 12.5 kg cylinder?". On yes, `emptyWeight = grossNow − nominalFill`. Self-calibrating and needs no knowledge of the stamp.
- **Cylinder change detection** is server-side from consecutive readings (a jump greater than a threshold within a short window); the device also raises `CYLINDER_CHANGED` when it sees one.
- Accuracy statements on the website ("accurate weight sensing") should be backed by a measured spec from firmware: resolution, drift over temperature, and settling time. See open questions.

## 6. Device contract (HTTPS + JSON, device-initiated)

> **Transport superseded by `CLOUD_ARCHITECTURE.md`:** with a universal 4G modem the device and cloud talk over **MQTT over TLS** (topics, payloads, command lifecycle and storage are defined there). The report, config and event content below still describes *what* is exchanged; read it together with that document, which wins on any difference.

Transport, identity and security follow section 5 of the handover with these refinements.

### 6.1 Report

`POST /api/device/v1/report` with `Authorization: Bearer <deviceToken>`

```json
{
  "deviceId": "FG-2024-0047",
  "fw": "1.0.3", "cal": 2, "cfg": 7, "seq": 1042,
  "readings": [
    { "t": "2026-11-02T06:00:00Z", "kg": 31.42, "tempC": 27.5, "stable": true }
  ],
  "events": [ { "t": "2026-11-02T06:00:00Z", "code": "CYLINDER_CHANGED", "kg": 31.4 } ],
  "battery": { "mV": 3580, "pct": 74, "powered": false },
  "net": { "rssi": -87, "rat": "LTE", "ccid": "89234…" },
  "reason": "heartbeat"
}
```

- `kg` is **gross** weight on the platform, platform-tare already removed. `cal` = factory calibration version used, so a bad calibration can be corrected server-side.
- `stable` is true only if the reading settled (no knocks, no cylinder being moved). The server ignores unstable readings for alerts and analytics.
- `reason` ∈ `heartbeat | change | event | refresh | boot | retry`. Lets us see why the device woke and tune the power budget.
- `seq` makes retries idempotent; `readings` may be a batch from offline buffering.
- Keep a hard cap on batch size (for example 48 readings) and a ring buffer in flash.

### 6.2 Response (the shadow)

```json
{
  "ok": true,
  "serverTime": "2026-11-02T06:00:01Z",
  "config": {
    "version": 8,
    "reportEverySec": 14400,
    "changeStepKg": 0.5,
    "wakeBelowKg": 4.0,
    "lowBatteryMv": 3300
  },
  "commands": [ { "id": "c91", "type": "TARE" } ]
}
```

- **The user's alert threshold is not sent to the device for the purpose of alerting**; the server decides alerts. The device only receives `wakeBelowKg`, a *device-side wake trigger* so it reports promptly and more often near empty (the server derives it from the user's threshold plus a margin). This removes today's 1 to 9 kg integer limit, which is a USSD artefact, not a product requirement: the page promises thresholds the user "can set yourself", in kg, percent or days.
- The device sends `cfg` (the version it holds) with every report. A mismatch means "still pending" in the app.
- Commands: `TARE`, `REPORT_NOW`, `REBOOT`, later `FW_UPDATE`. Each is acknowledged.

### 6.3 Ack

`POST /api/device/v1/ack` `{ "commandId": "c91", "result": "OK|FAILED", "detail": "…", "t": "…" }`
Also sent for config application (`{ "configVersion": 8, "result": "OK" }`).

### 6.4 Events the device may raise

`CYLINDER_CHANGED`, `TARE_DONE`, `LOW_BATTERY`, `TAMPER`, `FAULT` (with a sub-code), `BOOT` (with reset reason), `NO_NETWORK_RECOVERED`. Note there is deliberately **no `LOW_GAS` from the device on 4G**: low gas is a rule over the user's threshold and the cylinder's calibration, evaluated on the server. (The device still wakes early below `wakeBelowKg`, so the reading arrives promptly.)

## 7. Server design

### 7.1 Data model (new Prisma tables, owned by the backend)

| Table | Purpose |
|---|---|
| `Device` | id, `deviceId` (unique), token hash, owner `userId`, linked `cylinderProfileId`, platform calibration, emptyWeightKg, fw, lastSeenAt, lastCfgApplied, status |
| `DeviceMember` | device, user, role (OWNER / MEMBER / VIEWER). Delivers the "same live reading for household, facility, restaurant" promise |
| `DeviceReading` | device, t, gross kg, net kg, percent, tempC, stable, reason. Keep raw 90 days |
| `DeviceReadingDaily` | device, day, start/end kg, consumedKg, minKg, readings count. Powers analytics cheaply and keeps the history after raw data is pruned |
| `DeviceEvent` | device, t, code, payload |
| `DeviceConfig` | device, version, desired settings JSON (single row per device; version bumps on change) |
| `DeviceCommand` | device, type, status (QUEUED / SENT / ACKED / FAILED / EXPIRED), expiresAt |
| `DeviceAlertState` | device, rule, armed/fired, firedAt, lastNotifiedAt: the de-duplication state |
| `ReorderPolicy` | device, mode (OFF / ASK / AUTO), preferred vendor/listing, max price, delivery address, cooldown |

Existing `User.devicePhone` and the in-memory `deviceConfigs` map in `routes/device.ts` get retired; they are SMS-variant leftovers. The Prisma schema and migrations stay in `gas-monitor-backend/prisma/`, as the repo rules require.

### 7.2 Ingestion pipeline

1. Authenticate by device token; reject unknown/revoked.
2. Drop duplicates by `(device, seq)`; accept out-of-order batches by timestamp.
3. Correct timestamps if the device clock was clearly wrong (use `serverTime` skew).
4. Compute net kg and percent; store.
5. Detect cylinder change from the series; open a "confirm new cylinder" prompt for the user.
6. Update daily rollups.
7. Run the rules (7.3).
8. Build the response: current config, pending commands, `serverTime`.

### 7.3 Rules and alerts

| Rule | Fires when | Notes |
|---|---|---|
| `LOW` | net kg or percent or days-left crosses the user's threshold | Hysteresis: re-arms only after a refill (level rises above threshold plus margin) |
| `EMPTY` | net kg below a minimum (for example 0.5 kg) | Escalated tone |
| `OFFLINE` | no report for 2× the expected interval (plus grace) | "Your monitor hasn't checked in"; may be power or coverage |
| `LOW_BATTERY` | device event or `mV` below limit | Also to our ops |
| `UNUSUAL_USE` | consumption far above the household's norm | Worded as "unusual usage", not as leak detection, unless firmware and field testing support a leak claim |
| `TAMPER` / `FAULT` | device event | Ops, and the user if it affects readings |

Every rule uses `DeviceAlertState` so a user gets one alert per crossing, not one per reading.

**Notification channels:** the system already has everything required: Expo push (`PushToken`, `lib/push.ts`), in-app `Notification` rows with the bell, Resend email, and Termii SMS. Suggested policy: push + in-app always; SMS to the owner's number for `EMPTY` and `OFFLINE` if enabled (this is the channel that works when the phone has no data). Channels and quiet hours are user preferences.

### 7.4 Forecasting and analytics

- Daily consumption from rollups (`start − end`, adjusted around refills so a cylinder change isn't read as negative usage).
- Forecast: exponentially weighted average of recent daily use, with a day-of-week profile when there is enough history; **days left = net kg ÷ expected daily use**. Show a range, not a false precision, until there are at least 2 weeks of data. Before that, say "learning your usage".
- Feeds the existing consumer analytics screen and the refill reminder card.

### 7.5 Reorder (the "ask first or automatic" promise)

The ordering stack (listings, vendors, riders, Paystack/MyIMO, order tracking) already exists. The device adds only a **trigger and a policy**:

1. On `LOW` the policy engine checks `ReorderPolicy`.
2. **ASK** (default): push "You're at 18%. Reorder 12.5 kg from *Vendor X* for ₦…?" Tapping opens the order screen pre-filled (cylinder size from the linked profile, saved address, preferred vendor). The user pays in the usual checkout.
3. **AUTO:** needs a stored payment authorisation. Today every order uses a one-off checkout (Paystack WebView / hosted link), so AUTO requires a **new** capability: save a reusable card authorisation (Paystack supports charging a saved authorisation) with explicit consent and a spending cap. Treat as its own project and ship ASK first.
4. Guardrails for both modes: no new prompt/order while one is open for that device; cooldown; only vendors with an in-stock listing for that size and `APPROVED` status; confirm the delivery address; cap price; an easy cancel while the order is still `PENDING`/`CONFIRMED`. Orders already enforce server-side pricing, so the device never supplies a price.
5. After delivery, the next `CYLINDER_CHANGED` closes the loop and re-arms the alert.

### 7.6 Linking and sharing

- Claim: user enters/scans the `deviceId` plus the **claim code** printed on the unit. The server binds device → account and issues no token to the app; the device keeps its own token.
- Share: owner invites members by email (same pattern as branch-manager invites). Members get the live reading and alerts; only the owner changes threshold, reorder policy, or unlinks.
- Unlinking/transfer: owner can release a device; a new owner re-claims. Factory reset is a manufacturer function and is not exposed to customers.

## 8. App and website changes

Parity rule from the repo: **a feature is not done until it exists on web (v2), mobile, and admin where relevant.**

| Surface | Change |
|---|---|
| Consumer home gauge | Replace the demo `gasLevel` and "Simulate Drain" with the live reading; show kg, percent, **last updated**, battery, signal; pull-to-refresh sends "Refresh now" |
| Device screen | Real device ID, status (online / offline / low battery), settings with **pending → applied** state, claim and unlink, members |
| Alert settings | Threshold in kg, percent or days; channels; quiet hours; reorder mode |
| History / analytics | Real consumption, refill pattern, days-left forecast |
| New-cylinder prompt | "Did you fit a full 12.5 kg cylinder?" (drives auto-calibration) |
| Reorder prompt | Deep link from push, pre-filled order |
| Admin | Device list (last seen, battery, firmware, signal), per-device readings and events, command queue, revoke token, fleet offline view; surfaced in the daily ops briefing |
| Remove | Mock sensor data in `routes/device.ts`; the 1 to 9 kg integer limit on 4G devices; the missing `deviceApi.setMinimumLevel` call |

## 9. USSD / SMS device (reduced profile)

Same server model, fewer capabilities. An abstraction mirroring the existing payment-gateway adapters keeps one codebase:

`DeviceChannel` interface (`sendConfig`, `sendCommand`, `ingest`) with two adapters: `cellularChannel` (section 6) and `smsChannel` (today's behaviour, plus the missing inbound path).

What the SMS device can and cannot do:

| Feature | SMS device |
|---|---|
| Live level | **No continuous level.** On demand via INFO; or the device sends a compact SMS on events |
| Low-gas alert | Device SMS to the owner (as today). With an inbound webhook, the server also learns of it and can drive push and reorder |
| Analytics / forecast | Only if the device also sends periodic compact SMS reports; costly, so treat as optional or low frequency |
| Settings | Existing commands; confirmed only once the inbound reply path exists |
| Cost | Every message is billable, so keep throttling |

**Required backend work for this profile:** an inbound SMS webhook (Termii inbound or a virtual number) that parses the existing reply strings and any compact report format, and a sender whitelist on the device. If compact reports are adopted, define one machine-readable line, for example `4FG|FG-2024-0047|31.4|74|LOW#`, rather than parsing prose.

## 10. Security and safety

- Per-device token (hashed at rest), TLS with certificate validation, revocation, command expiry, and `seq` replay protection.
- Rate limits on ingest per device; backoff on the device after failures.
- **Safety wording:** a gas product invites safety expectations. The marketing page does not promise leak detection and the system should not imply it. If leak or fast-drop detection is wanted, define it with field data and a clear disclaimer first.
- Privacy: readings reveal when a household is at home or cooking. Treat them as personal data (consent, deletion on account erasure, access limited to members). Account deletion already anonymises other data; device rows must join that routine.
- SMS variant: default password `1234` and open SIM number are weak; whitelist senders.

## 11. Phased delivery

| Phase | Deliver | Depends on |
|---|---|---|
| 0. Contract | Freeze the report/response format and event codes; bench device posting to a stub endpoint | Firmware engineer answers section 12 |
| 1. Ingest + gauge | Tables, ingest endpoint, net kg and percent, real gauge and device screen, link/claim | Phase 0 |
| 2. Alerts | Rules, de-dup state, push/in-app/SMS, offline detection, threshold settings, admin device list | Phase 1 |
| 3. History and forecast | Rollups, analytics, days-left, new-cylinder calibration | Phase 1 |
| 4. Reorder (ASK) | Policy, push deep link, pre-filled order | Phases 2, 3 |
| 5. Sharing, SMS profile | Members, inbound SMS webhook, compact SMS reports | Phase 1 |
| 6. Later | AUTO reorder (stored authorisation), OTA, leak/fast-drop detection | Product and legal decisions |

## 12. Questions for the firmware engineer

1. **Power:** battery-only, mains with backup, or both SKUs? Expected battery life at 4-hourly reporting?
2. **Modem class and coverage:** Cat-1(bis), Cat-M1 or NB-IoT, and which carriers have been tested at pilot sites? Does the chosen module support SMS wake while in deep sleep?
3. **Weight spec:** resolution, accuracy and drift over temperature (-10 to 60 C), and how long a reading takes to settle after a cylinder is placed.
4. **Calibration:** factory calibration procedure, and where the platform tare is stored. Can a field TARE fail, and how is that reported?
5. **Cylinder variety:** the platform has to hold 6 to 50 kg of gas. Is one set of load cells adequate for both ends of the range, or does accuracy at 6 kg suffer?
6. **Change detection:** can firmware reliably flag a cylinder swap (rapid step, then settle), or should only the server infer it?
7. **Buffer:** how many offline readings can be held in flash, and what happens on overflow?
8. **TLS cost:** is HTTPS acceptable on this MCU/modem, or is MQTT or CoAP preferable?
9. **Time:** does the modem provide network time at boot?
10. **Faults and tamper:** which faults can be detected (open or shorted load cell, ADC fault, enclosure switch, over-temperature)?
11. **OTA:** will the bootloader support dual-bank with rollback?
12. **Pressure:** the old code referenced a pressure value. Is there a sensor, or drop it?

## 13. Decisions we need from the business side

1. Power/SKU strategy (section 3).
2. Whether AUTO reorder is promised at launch (the page promises it; ASK can ship first and the page copy should match what is live).
3. Whether the "forecasts" and "unusual usage" claims are launched now or after enough field data exists.
4. SMS fallback alerts: who pays for the credit, and is it a paid-plan feature?
