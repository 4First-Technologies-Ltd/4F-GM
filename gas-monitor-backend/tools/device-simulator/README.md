# Device simulator

A fake 4FG device plus a local broker, so backend, app and firmware work can proceed without hardware. It speaks the real contract in `src/lib/deviceProtocol.ts` and validates its own outgoing messages against it.

Needs Node 20+ and `npm install` in `gas-monitor-backend/`. No database and no Docker.

```bash
npm run sim:broker                                   # 1. local MQTT broker on :1883
npm run sim:device -- --scenario refill --speed 600  # 2. a device
npm run sim:cli -- watch                             # 3. see every message
npm run sim:cli -- send FG-SIM-0001 REPORT_NOW       #    send a command, wait for the ack
npm run sim:cli -- config FG-SIM-0001 reportEverySec=120 wakeBelowKg=17
npm run sim:check                                    # contract smoke test (needs 1 and 2 running)
```

## Broker

Dev only (plain TCP, in memory). It enforces the topic rules the production broker must:

- a device logs in as itself (username equals client id, any non-empty password here)
- a device may publish only under its own `up/` topics and subscribe only under its own `dn/` topics
- the `service` account (`MQTT_SERVICE_USER` / `MQTT_SERVICE_PASS`, default `service`/`service`) may do anything

Add `--verbose` to print every device message.

## Device options

| Option | Default | Meaning |
|---|---|---|
| `--device` | `FG-SIM-0001` | Device id. Must match `^[A-Za-z0-9][A-Za-z0-9-]{2,31}$` |
| `--url` | `mqtt://localhost:1883` | Broker (or `MQTT_URL`) |
| `--scenario` | `steady` | `steady`, `refill`, `outage`, `lowbat`, `chaos` (all three) |
| `--speed` | `1` | Gas drains this many times faster and intervals shrink by the same factor. Timestamps stay real. `--speed 600` empties a cylinder in minutes |
| `--cylinder` | `12.5` | Nominal gas kg |
| `--empty-weight` | `14.8` | Empty cylinder weight (TW) |
| `--percent` | `80` | Starting fill |
| `--platform-empty` | off | Start with no cylinder, so `TARE` can succeed |
| `--clock-skew-sec` | `0` | Make the device clock wrong, to test server-side correction |
| `--reset` | off | Ignore saved state |

State (sequence number, applied config, recent command ids, battery) is kept in `tools/device-simulator/.state/<id>.json`, the way firmware would keep it in flash. It is git-ignored.

## Scenarios

- **refill**: when the cylinder is nearly empty it is lifted off (platform empty, readings unsettled), then a full one is fitted: `CYLINDER_CHANGED`. This is the only window where `TARE` is accepted.
- **outage**: after 45 s the connection is dropped uncleanly for 40 s. The broker publishes the last will (`offline`). On return the device sends `NETWORK_RECOVERED` and one `retry` batch of everything buffered.
- **lowbat**: the battery falls until it crosses `lowBatteryMv`, raising `LOW_BATTERY`.

## What the device does (reference behaviour for firmware)

- Persistent session (`clean=false`), QoS 1, last-will `{ "state": "offline" }` retained on `up/status`; publishes `online` (retained) on every connect.
- Reconnects with exponential backoff (1 s, 2 s, 4 s ... capped at 60 s) and random jitter.
- Samples into a RAM buffer of at most 48 readings; a report sends the buffer.
- Reports on: heartbeat interval, level change of at least `changeStepKg` (only when the reading is settled), a fast interval while gross weight is below `wakeBelowKg`, and any event.
- Applies a retained config only when its `version` is newer than the one held; out-of-range values are `REJECTED`.
- Commands: checks expiry (`issued + ttl`), answers a repeated id with the original result and does not act twice, rejects unknown types. `TARE` is refused with `PLATFORM_NOT_EMPTY` unless the platform is empty.

## Contract checks (`sim:check`)

Device cannot publish to or subscribe on another device's topics; a login whose username differs from the client id is refused; a duplicate command is acked twice but acted on once; an expired command is answered `EXPIRED`; `FACTORY_RESET` is `REJECTED`; out-of-range config is `REJECTED`, not applied.

## Provisioning and the end-to-end test

`npm run device:provision -- --prefix FG-2026- --count 20 --confirm > batch.csv` creates device records and prints `deviceId,secret,claimCode` once (only hashes are stored). Without `--confirm` it is a dry run that shows which database it would write to. **Your `.env` points at the real database, so check the target line first.**

`npm run sim:e2e` runs the whole chain (broker, ingest worker, API, simulator, Postgres) and checks claiming, isolation between users, live state, history, events, command and config acks, redelivery, bad input and revocation. It refuses to run unless `DATABASE_URL` is on this machine, and it creates and deletes its own records. To run it:

```bash
docker run -d --name 4fg-scratch -e POSTGRES_PASSWORD=test -e POSTGRES_DB=scratch -p 54329:5432 postgres:16-alpine
export DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/scratch DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy
npm run sim:e2e
```

(Use `127.0.0.1`, not `localhost`: on Windows `localhost` can resolve to IPv6 and miss Docker's port.)
