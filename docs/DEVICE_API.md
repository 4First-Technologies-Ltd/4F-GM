# Device read API (for the app and website)

Base path `/api/devices`. All calls need `Authorization: Bearer <accessToken>`. Source: `gas-monitor-backend/src/routes/devices.ts`.

A device is visible only to its members. A device id that is not yours answers **404 exactly like one that does not exist**, so ids cannot be probed. Secrets, claim hashes and other people's accounts are never returned (an owner sees their own members).

**Parity rule for this repo:** the mobile app and `gas-monitor-web-v2` should both use these endpoints; the admin panel gets its own fleet view later.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | The user's devices with live state |
| POST | `/claim` | Link a device to the account |
| GET | `/:id` | One device (owners also get `members`) |
| GET | `/:id/readings` | History: `bucket=raw\|hour\|day`, `from`, `to`, `limit` |
| GET | `/:id/events` | Events, newest first, paged with `before` |
| POST | `/:id/commands` | Ask the device to do something |
| GET | `/:id/commands` | Recent commands, newest first |
| GET | `/:id/commands/:cid` | One command and its status |
| PATCH | `/:id/settings` | Owner: nickname, cylinder, empty weight, reporting interval |

## The device object

```json
{
  "id": "FG-2026-0001",
  "nickname": "Kitchen",
  "role": "OWNER",
  "cylinder": { "id": "…", "name": "12.5 kg", "sizeKg": 12.5 },
  "emptyWeightKg": 14.8,
  "alerts": { "lowPercent": 20, "lowKg": null, "lowDays": null },
  "fw": "1.0.3",
  "claimedAt": "2026-11-02T10:00:00.000Z",
  "state": {
    "online": true,
    "lastSeenAt": "2026-11-02T12:00:00.000Z",
    "lastReadingAt": "2026-11-02T12:00:00.000Z",
    "readingAgeSec": 42,
    "stale": false,
    "grossKg": 21.05,
    "netKg": 6.25,
    "percent": 50.0,
    "calibrating": false,
    "tempC": 27.5,
    "batteryPct": 74,
    "externalPower": false,
    "rssi": -87
  },
  "config": { "version": 8, "applied": 8, "pending": false }
}
```

How to show it:

| Field | Meaning and what the UI should do |
|---|---|
| `state.percent`, `state.netKg` | The gauge. **`null` is not 0.** See the two cases below |
| `state.calibrating` | `true` = the cylinder's empty weight is not known yet, so the cloud cannot compute gas left. Show "Calibrating" and `grossKg` only, never 0% |
| `percent: null` with `calibrating: false` | No cylinder on the platform (it was lifted off, e.g. during a refill). Show "No cylinder", not an empty gauge or an alert |
| `state.online` | Connection state from the broker's presence message |
| `state.stale` | No reading for more than three times the expected interval, whatever `online` says. Show "last updated …" in a warning style |
| `state.readingAgeSec` | Seconds since the newest reading. Show "updated 2 min ago" |
| `config.pending` | A settings change is waiting for the device to apply it. Show "Will apply when the device next checks in" |
| `role` | `OWNER`, `MEMBER` or `VIEWER`. Only owners should see edit controls |
| `alerts` | The owner's low-gas thresholds (see Alerts below). Show them in settings |

## Claim

`POST /claim` `{ "deviceId": "FG-2026-0001", "claimCode": "ABCD-EFGH", "nickname": "Kitchen" }` (nickname optional). Case, spaces and a missing hyphen in the code are forgiven.

| Status | Code | Meaning |
|---|---|---|
| 201 | | `{ device }`. The caller is now the OWNER; their active cylinder (if any) is linked |
| 400 | `VALIDATION` | Missing or malformed fields |
| 404 | `INVALID_CLAIM` | **One answer for** unknown id, wrong code, already claimed, revoked. Nothing to enumerate |
| 409 | `ALREADY_LINKED` | This user already has the device |
| 429 | | Too many attempts (10 per 15 minutes per user) |

The code works once. Two people entering it at the same moment cannot both win.

## History

`GET /:id/readings?bucket=hour&from=…&to=…` (ISO times; default: the last 24 h, or 30 days for `day`).

| `bucket` | Source | Point | Max range |
|---|---|---|---|
| `raw` | every stored reading | `{ t, grossKg, netKg, percent, tempC, settled }`. Newest `limit` (default 500, max 1000) in the range, **oldest first**; `truncated: true` if more existed | 7 days |
| `hour` | settled readings averaged per hour | `{ t, grossKg, netKg, percent, minPercent, tempC, n }` | 90 days |
| `day` | daily rollup (Lagos days) | `{ day, startKg, endKg, minKg, maxKg, consumedKg, readings }` | 800 days |

A longer range answers `400 RANGE_TOO_LARGE`. `consumedKg` is gas actually used: refills and cylinder swaps never count as usage or negative usage. Gaps are real gaps (the device was offline); do not interpolate across them without saying so.

## Events

`GET /:id/events?limit=50&before=<id>&code=CYLINDER_CHANGED`. Returns `{ events: [{ id, t, code, payload }], next }`; pass `next` as `before` for the next page (`null` at the end). Ids are strings.

Codes you will see: `BOOT`, `CYLINDER_CHANGED`, `TARE_DONE`, `LOW_BATTERY`, `TAMPER`, `FAULT`, `NETWORK_RECOVERED`, and `CONFIG_REJECTED` (the cloud's own record that a device refused a setting). A cylinder change is stored once even when both the device and the cloud notice it; `payload.inferred: true` marks the cloud's own detection.

A `CYLINDER_CHANGED` is the moment to ask the user "Did you just fit a full 12.5 kg cylinder?" (the auto-calibration prompt in the design). That flow is not built yet.

## Commands

`POST /:id/commands` `{ "type": "REPORT_NOW" | "TARE" | "REBOOT", "idempotencyKey"?: "…" }`. Send the key as the `Idempotency-Key` header or in the body (8 to 80 characters of letters, digits, `_ . : -`). **Generate one per button tap and reuse it on retries**: a repeat returns the original command (200) instead of sending a second.

Success is **202 Accepted**: the device has not answered yet. The command is never "done" at that point. Poll `GET /:id/commands/:cid` every 1 to 2 seconds until `status` leaves `QUEUED` / `SENT`:

| `status` | Meaning | UI |
|---|---|---|
| `QUEUED` / `SENT` | Accepted, waiting for the device | Spinner |
| `ACKED` | The device did it (`result: "OK"`) | Done |
| `FAILED` | The device refused or failed; `detail` says why (e.g. `PLATFORM_NOT_EMPTY`) | Show the reason |
| `EXPIRED` | No answer in time (`REPORT_NOW` 30 s, `TARE` 60 s) | "The device did not respond" and offer retry |

A command past its deadline reads as `EXPIRED` immediately, even before it is saved that way.

| Type | Who | Offline device | Spacing |
|---|---|---|---|
| `REPORT_NOW` | owner, member | refused | 5 s |
| `TARE` | owner | refused | 30 s |
| `REBOOT` | owner | queued (up to 10 min) | 120 s |

Errors:

| Status | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION` | Unknown type or bad key. **Factory reset and firmware update do not exist here** |
| 403 | `FORBIDDEN_ROLE` | Not allowed for this member's role |
| 404 | `DEVICE_NOT_FOUND` | Not yours, or unknown |
| 409 | `DEVICE_OFFLINE` | **Tare and refresh are never queued for an offline device**: a tare that ran hours later, with a cylinder on, would corrupt the zero point. Tell the user to try again when the device is online |
| 429 | `RATE_LIMITED` | `Retry-After` header and `retryAfterSec` in the body |
| 503 | `CHANNEL_UNAVAILABLE` | The cloud could not reach the broker. Safe to retry; the command is recorded as FAILED |

`TARE` only works with the platform empty. The usual flow is: ask the user to remove the cylinder, then send it. If the cylinder is still on the device answers `FAILED` / `PLATFORM_NOT_EMPTY`.

## Settings

`PATCH /:id/settings` (owner only; members get 403). Any of: `nickname` (string or null), `cylinderId` (one of the caller's own cylinders, or null), `emptyWeightKg` (1 to 100, or null), `reportEverySec` (60 to 86400), `changeStepKg` (0.05 to 5), and the low-gas thresholds `lowPercent` (1 to 90), `lowKg` (0.5 to 50 or null), `lowDays` (0.5 to 30 or null). Unknown fields are a 400, not ignored.

The response is `{ device, configPublished }`. Changing the cylinder or empty weight also recomputes the device's report-faster threshold (a gross weight; the user never sees it). When the device config changes its `version` goes up and `config.pending` is true until the device reports the new version: show "Will apply when the device next checks in". `configPublished: false` means the broker could not be reached; the change is saved and is sent when the ingest worker next starts. `null` means the device config did not change (for example a nickname edit).

Setting `emptyWeightKg` is what ends the "calibrating" state. Until a way to learn it automatically exists (the cylinder-swap prompt), the app should ask for the stamped TW on the cylinder collar.

## Alerts

The cloud decides when to alert; the app only shows it. Four rules, one alert per crossing (never one per reading):

| Rule | Fires when | Re-arms when | Channels (in-app is always on) |
|---|---|---|---|
| `LOW` | Any configured criterion is met: gas ≤ `lowPercent` (default 20%), or ≤ `lowKg`, or the forecast says ≤ `lowDays` | Gas is clearly back: percent above the threshold + 10 points (and the kg and days criteria with margin). A refill does this | Push |
| `EMPTY` | Less than 0.5 kg of gas | More than 1.5 kg | Push, email, SMS |
| `OFFLINE` | No contact for 2.5 reporting intervals (never under 20 minutes) | The device is heard from again | Push, SMS |
| `LOW_BATTERY` | Battery at or below the device's low-battery voltage (not on mains) | 150 mV above it, or mains | Push, email |

- **The in-app message is the record.** It is a normal notification row, so it appears in the existing notification inbox (mobile `/notifications`, website `/dashboard/notifications`) with no new screen. Push, email and SMS are best effort on top.
- **Each person's own settings apply**: push needs `pushEnabled`, email needs a verified address and `emailNotifEnabled`, SMS needs `smsAlertsEnabled` and a phone number (SMS costs credit, so only EMPTY and OFFLINE use it). Owners and members are told; viewers are not.
- **No alert while the cloud does not know the gas level**: not while `calibrating`, and not while the cylinder is off the platform.
- **Days left needs history.** A `lowDays` threshold does nothing until there are at least 3 days of readings, and while the cylinder is barely used. Show "learning your usage" until then.
- **Alert history** is in the events feed: `ALERT_LOW`, `ALERT_EMPTY`, `ALERT_OFFLINE`, `ALERT_LOW_BATTERY` (payload has the percent, kg, and last-seen time at that moment).
- **Push payload** for deep links: `data: { type: "device_alert", deviceId, rule, action?: "order" }`. `action: "order"` (LOW and EMPTY) is the cue to open the refill flow. The app does not handle this yet.
- Not built: quiet hours, repeat reminders while a device stays low, and suppressing the alert when a refill order is already open (that belongs with the reorder prompt).

## Refill suggestion

`GET /api/devices/:id/reorder` (any member). Returns `{ sizeKg, options, hasOpenOrder, needsCylinder }`. `sizeKg` is the cylinder size the device is set to; `options` are up to 5 in-stock, approved listings that sell exactly that size, vendors the customer has had a delivery from first, then cheapest. Each option has `listingId`, `vendorName`, `branchName`, `city`, `cylinderSize` (pass this label unchanged to the order endpoint), `unitPrice` and `total` (one cylinder plus delivery). `hasOpenOrder` is true while a paid order is not yet delivered: show "refill on the way" instead of the prompt. `needsCylinder` means the device has no cylinder set, so ask for one first. It only suggests; the order endpoints price everything again.

The mobile app opens `/order` (with `deviceId`) when a push with `action: "order"` is tapped, and the supplier list shows the suggestion card on top; tapping an option opens the order form with that vendor and size selected. The website equivalent is `/dashboard/refill?deviceId=…`, which links each option to `/checkout?item=<listingId>&size=<cylinderSize>`. Monitor screens exist on both: mobile `app/monitors.tsx` (reached from the Device tab, "My 4G monitors") and web `/dashboard/monitors` (sidebar "My monitors"). Both list the user's monitors, show the level / online / battery state and a 24 h chart, send `REPORT_NOW` ("Refresh now", polled until acked), let an owner rename and set the low-gas percent (web), claim a device by ID and code, and link to the refill flow. Owners can also set the cylinder size (6, 12.5, 25 or 50 kg; the app reuses or creates the matching cylinder profile) and the empty weight stamped on the collar, which ends the "calibrating" state. Not built on either: tare, reboot, other cylinder sizes, kg and days thresholds, members, event history, and the older USSD Device screens still exist beside them. Inbox links: each notification now carries `kind` (`REFILL` for low and empty gas, `MONITOR` for offline and low battery; null for plain messages) and `refId` (the device id). Tapping one opens the refill suggestions or the monitor screen, on both the app and the website. Notifications created before this change have no link.

## Polling

Until live streaming exists, poll `GET /` or `GET /:id` every 5 to 15 seconds only while the screen is visible, and use `state.readingAgeSec` to say how fresh the data is. The device reports on its own schedule (typically hourly, sooner when the level moves), so a faster poll will mostly return the same reading.
