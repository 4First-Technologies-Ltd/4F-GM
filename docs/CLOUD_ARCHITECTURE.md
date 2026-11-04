# 4FG Cloud Architecture: Device Data and Commands

**Status:** proposal. **Supersedes** the transport choice (HTTPS check-in) in `DEVICE_APP_INTEGRATION_DESIGN.md` section 6. Everything in that document about *what* the system does (net gas maths, alert rules, forecast, reorder, sharing, phases) still stands; this document defines *how the cloud carries it*.
**Scope:** a universal 4G modem device that uploads data to the cloud, with the app reading it and sending commands back the same way. The cloud is the foundation of the remote view.

---

## 1. Goals

1. Every device reading is stored in the cloud, durably, and is retrievable from the app (latest value, history, events).
2. The app can send commands to a device (tare, report now, change settings) and see what happened to each one.
3. Command and data flow use **one mechanism in both directions**, so they behave the same way.
4. It runs on the infrastructure you already own (one VPS, Docker Compose, Postgres, Caddy), and has a clear path to scale.
5. The app never talks to a device directly. The cloud is the only meeting point.

## 2. The architecture in one picture

```
            DEVICE SIDE                              CLOUD (existing VPS, Docker Compose)                       CLIENTS
                                          ┌──────────────────────────────────────────────────────────┐
 ┌────────────────┐   MQTT over TLS :8883 │  ┌──────────┐  subscribe   ┌──────────┐   SQL   ┌────────┐ │
 │ MCU + universal├──────────────────────►│  │  MQTT    ├─────────────►│  Ingest  ├────────►│Postgres│ │
 │ 4G modem       │◄──────────────────────┤  │  broker  │              │  worker  │         │        │ │
 └────────────────┘   telemetry up        │  └────▲─────┘              └────┬─────┘         └───▲────┘ │
        ▲             commands/config down│       │ publish                 │ rules/alerts      │      │
        │                                 │  ┌────┴─────┐                   ▼                   │      │
        │ (optional wake SMS              │  │ Command  │◄──── API ────┐  ┌─────────┐          │      │   HTTPS (Caddy :443)
        │  for battery SKU)               │  │ dispatch │              └──┤ Notifier│          │      │ ┌───────────────┐
        │                                 │  └──────────┘                 └────┬────┘          │      │ │ Mobile app    │
 ┌──────┴───────┐                         │            ┌────────────────────────▼───────────────┴──┐   │ │ Website       │
 │ Termii SMS   │                         │            │ Express API (existing): /api/devices/…    │◄──┼─┤ Admin panel   │
 └──────────────┘                         │            └───────────────────────────────────────────┘   │ └───────────────┘
                                          └──────────────────────────────────────────────────────────┘
```

**Four moving parts, three of them new:**

| Part | New? | Job |
|---|---|---|
| MQTT broker | New container | The two-way pipe to devices. Holds messages for devices that are briefly offline |
| Ingest worker | New container (same codebase as the API) | Reads device messages, validates, stores them, evaluates alert rules |
| Command dispatcher | New module in the API | Turns an app request into a tracked, expiring command and publishes it |
| Express API | Existing | The only thing the app and website call. Authorisation, history queries, command requests |

## 3. Why MQTT

| Need | HTTPS polling by the device | **MQTT** | Raw TCP/UDP |
|---|---|---|---|
| App command reaches the device quickly | No. Waits for the next check-in | **Yes, pushed instantly while connected** | Yes, but you build everything |
| Command for an offline device | Needs custom queueing | **Broker holds it (persistent session, QoS 1)** | Custom |
| Know whether a device is online | Guess from last check-in | **Last-will message gives an instant "offline"** | Custom |
| Fit with universal 4G modems | Good | **Good: Quectel/SIMCom-class modules ship MQTT-over-TLS AT commands** | Varies |
| Data per message | Large headers | **Tiny headers, cheap on SIM data** | Small |
| Debuggability | Easy | Good with a broker log or client tool | Poor |

MQTT is the standard answer to "send data up, send commands down, keep it cheap". The firmware engineer should confirm the chosen module's MQTT stack handles TLS, last-will, persistent sessions and QoS 1; if not, a fallback is HTTPS on the device and a "command pull" at each check-in, with the same cloud data model underneath (nothing above the transport layer changes).

**Hosting choice**

| Option | Notes |
|---|---|
| **Self-host Mosquitto or EMQX Open Source on the existing VPS** (recommended to start) | Matches the "own the backend" direction, no per-message fees. Mosquitto is tiny (a few MB of RAM); EMQX gives a dashboard and built-in HTTP auth and ACL hooks but uses more memory, and its licence terms have changed between versions, so check them before choosing. On a 2 vCore / 4 GB VPS either fits for a pilot |
| Managed (HiveMQ Cloud, AWS IoT Core, EMQX Cloud) | Less to operate, but per-device or per-message cost, and device data leaves your servers. A reasonable later move if operating the broker becomes a burden |

Recommendation: start with Mosquitto plus an HTTP/DB auth plugin (or EMQX if you want the dashboard), behind the same VPS, and keep the broker address a config value in the device so it can be moved later without a firmware change.

## 4. Topics and messages

Namespace by version and device id so the broker can enforce who may read or write what.

| Topic | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `4fg/v1/d/{deviceId}/up/telemetry` | device → cloud | 1 | no | Readings (single or batch) |
| `4fg/v1/d/{deviceId}/up/event` | device → cloud | 1 | no | Edge events: `CYLINDER_CHANGED`, `TARE_DONE`, `LOW_BATTERY`, `TAMPER`, `FAULT`, `BOOT` |
| `4fg/v1/d/{deviceId}/up/ack` | device → cloud | 1 | no | Result of a command or applied config version |
| `4fg/v1/d/{deviceId}/up/status` | device → cloud | 1 | **yes** | `online` on connect; the broker publishes `offline` as the **last-will** if the connection drops |
| `4fg/v1/d/{deviceId}/dn/cmd` | cloud → device | 1 | no | Commands |
| `4fg/v1/d/{deviceId}/dn/cfg` | cloud → device | 1 | **yes** | Desired configuration. Retained, so a device that reconnects gets the latest immediately |

### 4.1 Telemetry (device → cloud)

```json
{
  "v": 1,
  "seq": 20418,
  "t": "2026-11-02T06:00:00Z",
  "up": 86400,
  "r": [
    { "t": "2026-11-02T06:00:00Z", "kg": 31.42, "c": 27.5, "s": 1 }
  ],
  "bat": { "mv": 3580, "pct": 74, "ext": 0 },
  "net": { "rssi": -87, "rat": "LTE" },
  "fw": "1.0.3", "cal": 2, "cfg": 8,
  "why": "heartbeat"
}
```

`kg` gross weight with platform tare removed; `s` = settled flag; `up` = uptime seconds (lets the server spot reboots); `cfg` = config version the device currently holds; `why` ∈ `heartbeat | change | event | refresh | boot | retry`. The server **always** records its own `receivedAt`, and uses the device clock only as a hint (see section 9).

### 4.2 Command (cloud → device)

```json
{ "id": "cmd_01JABC…", "type": "TARE", "issued": "2026-11-02T06:01:00Z", "ttl": 60, "args": {} }
```

- `id` is globally unique. The device **remembers the last ~20 ids** and answers a repeat with the stored result instead of acting twice (QoS 1 can deliver a message more than once).
- `ttl` seconds: after `issued + ttl` the device must ignore the command and ack `EXPIRED`. If the device clock is unreliable it should use time since it received the message.
- Customer-facing types: `TARE`, `REPORT_NOW`, `REBOOT`. Manufacturer-only types (`FACTORY_RESET`, `FW_UPDATE`) are never exposed through the customer API.

### 4.3 Ack (device → cloud)

```json
{ "cmd": "cmd_01JABC…", "res": "OK", "detail": "", "t": "2026-11-02T06:01:03Z" }
{ "cfg": 8, "res": "OK", "t": "…" }
```

`res` ∈ `OK | FAILED | EXPIRED | REJECTED`. A repeated command id is answered by re-publishing the original ack (there is no separate duplicate result).

### 4.4 Config (cloud → device, retained)

```json
{
  "version": 8,
  "reportEverySec": 3600,
  "changeStepKg": 0.5,
  "wakeBelowKg": 0,   // GROSS kg; 0 = off
  "lowBatteryMv": 3300
}
```

## 5. Device identity, authentication and permissions

- Each unit gets, at factory: `deviceId` (printed on the unit), a random **device secret** (32+ bytes), and a short **claim code**. The server stores only a hash of the secret.
- MQTT login: `clientId = deviceId`, `username = deviceId`, `password = secret`, over **TLS with server-certificate validation** (the device holds the CA certificate). Per-device client certificates are stronger and a good later upgrade; passwords plus TLS are acceptable for a pilot.
- **Broker ACL:** a device may publish only to its own `…/up/*` and subscribe only to its own `…/dn/*`. It can never see another device's traffic. The ingest worker and the command dispatcher use separate privileged service accounts.
- Auth source: the broker asks the 4FG database (through the plugin's HTTP or Postgres backend) whether the credentials are valid and the device is not revoked. **Revoking a device in the admin panel therefore cuts it off at the broker.**
- Network: the broker listens on **8883 (TLS)** on a dedicated hostname such as `mqtt.4fgmonitor.com`, DNS-only (not proxied through Cloudflare's HTTP proxy). The firewall (currently 22/80/443) needs 8883 opened. Caddy does not need to proxy MQTT; give the broker its own certificate (renewed by Caddy's ACME or certbot and shared to the broker via a volume).
- The app and website **never connect to the broker**. They call the Express API with their normal user tokens, which keeps all authorisation (owner, member, viewer) in one place.

## 6. Cloud storage

All in the existing Postgres (backend owns the schema and migrations, per repo rules).

> The authoritative schema is `gas-monitor-backend/prisma/schema.prisma` (migration `20261102000000_device_cloud`). The sketch below is kept for orientation.

```prisma
model Device {
  id             String   @id                // the id printed on the unit, e.g. FG-2024-0047
  secretHash     String                       // hash of the MQTT secret
  claimCodeHash  String?
  ownerId        String?                      // User; null until claimed
  cylinderId     String?                      // CylinderProfile in use
  emptyWeightKg  Float?                       // learned or entered
  platformCal    Int      @default(1)
  fw             String?
  revokedAt      DateTime?
  createdAt      DateTime @default(now())
  state          DeviceState?
  members        DeviceMember[]
}

model DeviceState {                           // ONE row per device. What the app reads for the live view.
  deviceId     String   @id
  online       Boolean  @default(false)
  lastSeenAt   DateTime?
  lastReadingAt DateTime?
  grossKg      Float?
  netKg        Float?
  percent      Float?
  tempC        Float?
  batteryPct   Int?
  rssi         Int?
  cfgApplied   Int      @default(0)
  fw           String?
  updatedAt    DateTime @updatedAt
}

model DeviceReading {                         // append-only history
  id          BigInt   @id @default(autoincrement())
  deviceId    String
  t           DateTime                        // device time, corrected
  receivedAt  DateTime @default(now())
  seq         Int
  grossKg     Float
  netKg       Float?
  percent     Float?
  tempC       Float?
  settled     Boolean
  why         String
  @@unique([deviceId, seq, t])                // makes redelivery harmless
  @@index([deviceId, t])
}

model DeviceReadingDaily { deviceId String; day DateTime; startKg Float; endKg Float; minKg Float; consumedKg Float; count Int; @@id([deviceId, day]) }
model DeviceEvent        { id BigInt @id @default(autoincrement()); deviceId String; t DateTime; code String; payload Json?; @@index([deviceId, t]) }
model DeviceConfig       { deviceId String @id; version Int; desired Json; updatedAt DateTime @updatedAt }
model DeviceCommand      { id String @id; deviceId String; type String; args Json?; status CommandStatus; requestedBy String; requestedAt DateTime @default(now()); sentAt DateTime?; ackedAt DateTime?; expiresAt DateTime; result String?; detail String?; @@index([deviceId, requestedAt]) }
model DeviceMember       { deviceId String; userId String; role DeviceRole; @@id([deviceId, userId]) }
model DeviceAlertState   { deviceId String; rule String; armed Boolean; firedAt DateTime?; lastNotifiedAt DateTime?; @@id([deviceId, rule]) }

enum CommandStatus { QUEUED SENT ACKED FAILED EXPIRED CANCELLED }
enum DeviceRole    { OWNER MEMBER VIEWER }
```

**Why a separate `DeviceState` row:** the app's home screen and device list need the latest values for many devices quickly. Reading one small row beats scanning the history table, and it is what the realtime view reads.

**Retention and size (estimate, to be validated in the pilot):** a reading row with indexes is roughly 100 to 150 bytes. At one reading per 15 minutes that is about 96 rows per device per day; 1,000 devices produce roughly 100k rows (about 10 to 15 MB) per day and 3 to 4 GB of raw history for 30 days. The VPS has 64 GB, so a pilot of a few hundred devices is comfortable. Rules to keep it healthy:

- Keep **raw readings 90 days** (shorter for dense profiles), then delete; keep `DeviceReadingDaily` indefinitely for analytics.
- Partition `DeviceReading` by month once it passes a few tens of millions of rows, so deleting a month is a cheap `DROP PARTITION`.
- Make the device **report on change, not on a fixed fast timer**: a cylinder sitting untouched overnight should send almost nothing. This saves SIM data, battery, and database space.
- Account erasure must remove or anonymise device links and history, joining the existing `accountDeletion` routine.

If the data volume ever outgrows plain Postgres, TimescaleDB (a Postgres extension) is a natural next step with no change to the model.

## 7. Data path: device → cloud → app

1. Device publishes telemetry to `…/up/telemetry` (QoS 1).
2. The **ingest worker** (a persistent-session subscriber to `4fg/v1/d/+/up/#`) receives it. If the worker is briefly down, the broker holds the messages and delivers them on restart.
3. Validate the schema and the device's existence. Reject malformed payloads to a dead-letter log (`server_logs`).
4. Deduplicate on `(deviceId, seq, t)`; correct the timestamp if the device clock is off (section 9).
5. Compute net kg and percent from the linked cylinder; insert the `DeviceReading`; update `DeviceState`; update daily rollups.
6. Apply `up/event` messages and `up/status` online/offline changes to `DeviceState`/`DeviceEvent`.
7. Evaluate alert rules (`LOW`, `EMPTY`, `OFFLINE`, `LOW_BATTERY`) against `DeviceAlertState` and hand any firing alert to the existing notifier (push, in-app, SMS, email).
8. The app asks the API; the API answers from `DeviceState` (live) or `DeviceReading`/`DeviceReadingDaily` (history).

### API for the app and website (all Bearer-authenticated; scoped to the user's devices through `DeviceMember`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/devices` | The user's devices with their live state (reads `DeviceState`) |
| GET | `/api/devices/:id` | One device: state, config, cylinder, members |
| GET | `/api/devices/:id/readings?from&to&bucket=raw\|hour\|day` | History for charts. Server downsamples; never returns unbounded rows |
| GET | `/api/devices/:id/events?limit` | Events and alerts |
| POST | `/api/devices/claim` | `{ deviceId, claimCode }` link a device to the account |
| PATCH | `/api/devices/:id/settings` | Alert threshold, cylinder, reorder mode (server-side settings) and device config changes (which bump `DeviceConfig.version`) |
| POST | `/api/devices/:id/commands` | `{ type, args }` returns `{ commandId, status }` immediately |
| GET | `/api/devices/:id/commands/:cid` | Command status |
| GET | `/api/devices/:id/stream` | Optional live updates (section 8) |

## 8. Command path: app → cloud → device

```
 App                API                      DB                 Broker              Device
  │ POST /commands   │                        │                   │                   │
  ├─────────────────►│ authorise (owner/member)│                   │                   │
  │                  │ rate-limit, validate    │                   │                   │
  │                  ├── insert QUEUED ───────►│                   │                   │
  │◄─ 202 {cmdId} ───┤                        │                   │                   │
  │                  ├── publish dn/cmd (QoS1)─────────────────────►│── deliver ───────►│
  │                  ├── mark SENT ──────────►│                   │                   │ run command
  │                  │                        │                   │◄── up/ack (OK) ───┤
  │                  │◄── ingest worker sees ack ──────────────────┤                   │
  │                  ├── mark ACKED ─────────►│                   │                   │
  │ GET /commands/id │                        │                   │                   │
  ├─────────────────►│ ◄── status ACKED ──────┤                   │                   │
```

**Rules that make this safe:**

- **Every command is a database row first**, with an `expiresAt`. A command that is never acknowledged becomes `EXPIRED`, not "sent forever". A janitor job sweeps this every few seconds.
- **Per-command expiry and offline policy:**

| Command | If device is offline | Expiry |
|---|---|---|
| `REPORT_NOW` | Reject immediately ("device offline") | 30 s |
| `TARE` | **Reject if offline. Never queue.** A tare that runs hours later, with a cylinder on the platform, would corrupt the zero point and wrong-read every later value | 60 s |
| `REBOOT` | Queue | 10 min |
| Config change | Always accepted: it is the retained `dn/cfg`, applied whenever the device reconnects | none (latest wins) |

- Idempotent by `id` on both sides. The API also accepts a client-supplied `Idempotency-Key` so a double-tapped button does not create two commands.
- Authorisation: owner or member for `REPORT_NOW`; owner only for `TARE`, config, unlink. Every command is written to an audit trail (the project already has an audit-log pattern) with who asked and when.
- Rate limit per device and per user (for example one `TARE` per minute) to protect the device and the SIM data.
- The app shows the true state: **Queued → Sent → Done / Failed / Expired**, not a fake instant success. (This is the main weakness of today's SMS path.)

**Getting results to the screen.** Start simple, upgrade later:

| Stage | Mechanism | Notes |
|---|---|---|
| v1 | The app **polls** `GET /commands/:id` (every 1 to 2 s for up to the TTL) and polls `/devices` every 5 to 15 s while the screen is focused | Matches how the rider screen already polls every 30 s. No new infrastructure, works on mobile and web today |
| v2 | **Server-Sent Events** at `/api/devices/:id/stream` pushing state, command updates and alerts | Express and Caddy handle SSE well. The single-instance assumption lets an in-process event emitter drive it; move to Postgres LISTEN/NOTIFY or Redis if the API ever runs on more than one instance. React Native needs an EventSource polyfill |
| Always | **Push notifications** for alerts and "your command finished" when the app is closed | Reuse the existing Expo push and in-app notification system |

Do not put app clients on the MQTT broker in v1. It would duplicate authorisation and complicate mobile builds.

## 9. Presence, clocks and ordering

- **Online/offline:** the device sets a last-will on connect; the broker publishes `offline` if the connection drops uncleanly, and the device publishes `online` (retained) when it connects. Also keep `lastSeenAt` from any message, and a server job that flags a device `OFFLINE` after it misses 2× its configured interval with no message (covers a half-dead connection that the broker has not noticed yet).
- **Clocks:** field devices drift and may boot with a wrong clock before network time arrives. The server stores `receivedAt` on everything. If the device time differs from the server by more than a few minutes, readings are stamped `receivedAt − (messageTime − readingTime)` (that is, keep the *relative* spacing inside a batch). The device should take network time from the modem when it can and report `up` (uptime) so reboots are visible.
- **Ordering and duplicates:** QoS 1 means at-least-once. Use `seq` plus the unique key to make redelivery harmless; process batches in timestamp order; ignore readings older than the latest *only* for `DeviceState` (still store them in history).
- **Reconnect storms:** a regional outage restoring can reconnect thousands of devices at once. The firmware must use exponential backoff with random jitter, and the ingest worker must be able to absorb a burst (batch inserts).

## 10. Deployment on the existing VPS

Add two services to `/opt/4fg/docker-compose.yml` next to `db`, `api` and `caddy`:

```yaml
  mqtt:
    image: eclipse-mosquitto:2        # or emqx, see section 3
    restart: unless-stopped
    ports: ["8883:8883"]              # TLS only; no plain 1883 published
    volumes:
      - ./mqtt/config:/mosquitto/config
      - ./mqtt/data:/mosquitto/data   # persistent sessions and retained messages
      - ./certs:/mosquitto/certs:ro

  ingest:
    build: ./repo/gas-monitor-backend   # same image as the API, different entrypoint
    command: node dist/workers/ingest.js
    restart: unless-stopped
    env_file: .env
    depends_on: [db, mqtt]
```

Operational notes:

- Open 8883 in ufw; do **not** expose 1883. The `.env` rules from the migration notes apply (delete variables rather than blanking them).
- Add `MQTT_URL`, `MQTT_SERVICE_USER`, `MQTT_SERVICE_PASS` to `.env` and the new `.env.example` entries.
- Back up `./mqtt/data` (retained messages and sessions) with the existing backup routine, and make the ingest worker rebuild retained `cfg` messages from `DeviceConfig` on start so the database stays the source of truth.
- Single-instance assumption holds, as with marketing campaigns and the ops briefing: one ingest worker. Document that if it is ever scaled, MQTT *shared subscriptions* split the load.
- Observability: ingest lag, messages per minute, devices online, parse failures and command timeout rate go into the existing server logs and the daily ops briefing; the admin panel gets a fleet page (last seen, battery, signal, firmware, pending commands, revoke).
- Capacity on 2 vCore / 4 GB: fine for a pilot of hundreds of devices. The first things to move out as the fleet grows are the broker (own VM or managed) and the readings table (partitions or TimescaleDB).

## 11. Failure modes

| Failure | What happens | Mitigation |
|---|---|---|
| Device loses coverage | Last will fires; app shows "offline, last seen 14:02"; alert rule `OFFLINE` after the grace period | Device buffers readings in flash and uploads them when back |
| Broker down | Devices reconnect with backoff; the API rejects commands with a clear "device channel unavailable" | Health check, restart policy, alert to ops |
| Ingest worker down | Broker holds QoS 1 messages for its persistent session; worker catches up on restart | Monitor ingest lag; cap queue size |
| Postgres down | Worker retries; messages stay in the broker | Existing backups; do not ack to the broker until committed |
| Command sent, no ack | Row becomes `EXPIRED`; app shows "device did not respond" | TTL janitor; user may retry |
| Duplicate delivery | Harmless: `(deviceId, seq, t)` unique key and command-id memory on device | |
| Stolen or cloned device credentials | Revoke in admin: broker auth fails on next connect; disconnect forced | Per-device secret; certs later |
| Wrong device clock | Readings stamped with corrected times | `receivedAt` always stored |
| Flood of messages from one device | Broker per-client rate limit, ingest drops and logs | Firmware reporting floor |

## 12. Build order (cloud first, so the app and firmware can progress in parallel)

**Status (3 Nov 2026):** steps 1 (schema; migration verified on a real Postgres with no drift), 3 (simulator), 4 (ingest worker), 5 (read API), 6 (commands: `POST /:id/commands`, publisher, expiry sweeper, ack handling) and 7 (config shadow: `PATCH /:id/settings`, retained publish, re-publish from the database when the worker starts) are built and tested end to end, including a database outage mid-stream (no message lost) and a broker outage mid-request (clean 503 in about a second). The full chain is checked by `npm run sim:e2e` (dozens of checks against a real Postgres) and 293 unit tests. Reference: `DEVICE_API.md`. Step 2 (broker) is built and verified locally with real Mosquitto over TLS, with every connection and topic checked against the API (`deploy/mqtt/`, runbook in its README); it is **not yet deployed to the VPS**. Step 8 (alert rules: LOW, EMPTY, OFFLINE, LOW_BATTERY, with the offline sweep in the ingest worker and in-app, push, email and SMS delivery) is built and covered end to end. Still to do: 9 (admin fleet page; revoke already works at the broker), 10 (live stream). Device provisioning is `npm run device:provision`. Remaining small items: hook device rows into account erasure; a retention job for raw readings; the `ingest` service in the VPS compose file; quiet hours and the reorder prompt (the alert push already carries `action: "order"`).

1. **Schema and migration:** `Device*` tables above.
2. **Broker running** on the VPS with TLS and per-device auth; one test device account.
3. **Device simulator** (a small Node script in the repo): connects as a fake device, publishes realistic telemetry (slow drain, a cylinder swap, a low battery), answers commands and acks. **This lets backend and app work proceed before any hardware exists**, and later doubles as a load test.
4. **Ingest worker:** validate, store, `DeviceState`, rollups.
5. **Read API:** `/devices`, `/readings`, `/events`; swap the app's mock gauge for real state.
6. **Command dispatcher + ack handling:** `/commands`, expiry janitor, status in the app (poll first).
7. **Config shadow:** `dn/cfg` retained + applied-version display.
8. **Alert rules and notifier:** `LOW`, `EMPTY`, `OFFLINE`, `LOW_BATTERY` with de-dup state.
9. **Admin fleet page, revoke, audit.**
10. **SSE live stream**, then the later items from the design document (analytics and forecast, reorder prompts, sharing).

Retire the current SMS-based `routes/device.ts` mock responses once step 5 and 6 ship. The USSD/SMS device remains supported through a separate channel adapter (design document section 9), feeding the same tables.

## 13. Decisions to confirm

1. **Broker:** self-hosted Mosquitto vs EMQX vs managed. (Recommendation: self-host Mosquitto first.)
2. **Hostname:** `mqtt.4fgmonitor.com`, DNS-only, and opening port 8883 on the VPS.
3. **Device auth for the pilot:** per-device password over TLS now, client certificates later?
4. **Power profile** (from the design document): an always-on powered unit gets instant commands; a battery unit would hold the connection only in windows, so commands wait and a wake SMS can start a session. The cloud design is identical either way, only the latency changes.
5. **Retention:** 90 days raw plus permanent daily rollups acceptable?
6. **Who may command:** owner for `TARE`/config, members for `REPORT_NOW`; vendors and riders never see devices.

## 14. Questions for the firmware engineer

1. Which module will be used, and does its built-in MQTT client support TLS with CA validation, last-will, persistent sessions (`clean session = 0`), QoS 1 and keepalive tuning? If not, can the MCU run the MQTT stack over the module's socket interface?
2. Can the device hold the connection continuously on the target power profile, and what is the measured current in that mode?
3. How much flash can buffer offline readings, and what is the overflow policy?
4. Network time at boot, and the behaviour of the clock when there is no network yet?
5. Can the device keep the last ~20 command ids in non-volatile memory across reboots?
6. How will unique `deviceId`, secret and claim code be provisioned on the production line?
7. What is the SIM data plan size per device per month? (This sets the reporting cadence ceiling; the cloud is built to be thrifty either way.)
