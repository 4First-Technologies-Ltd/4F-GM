# 4FG Smart Gas Monitor: Device Integration Handover

**Audience:** embedded / firmware engineer
**Purpose:** explain what the app and backend expect from the device, so the firmware can be built for both the **USSD/SMS device** and the **4G modem device** (priority).
**Status legend:** **[EXISTS]** = already in the codebase. **[PROPOSED]** = a recommendation for you to review and change. Nothing marked PROPOSED is built on the backend yet.

---

## 1. The product in one paragraph

4FG is a weighing platform that a household or commercial gas cylinder (3 to 50 kg of gas) stands on. The device measures the cylinder's weight continuously and works out how much gas is left. The mobile app and website show that as a live level, alert the owner before the gas runs out, and let them reorder from a nearby vendor with one tap. The device is the data source for all of it. Users never touch the device after install except to set a few values (alert threshold, phone number, location).

Delivered gas is bought and paid for in the app (Paystack/MyIMO), so the device's job is **measure, report, alert, and accept a few settings**. It does not take payments or place orders.

## 2. What the app wants from the device

| # | Capability | Why it matters to the user |
|---|---|---|
| 1 | **Gas weight (kg)**, net of cylinder and platform | Drives the gauge (percent left) and the "days remaining" estimate |
| 2 | **Low-gas alert** when gas falls to the user's chosen level | The headline feature: "alert me before I run empty", then reorder |
| 3 | **Usage history** (readings over time) | History tab and consumption insights. The app shows an empty state until real readings exist |
| 4 | **Tare / zero** on command | Used after install or after changing cylinders |
| 5 | **Set alert threshold** (critical level) | User picks it in the app |
| 6 | **Set owner phone number** for SMS alerts | Fallback alert channel that works without internet |
| 7 | **Set location label** | Shown in the app and returned in INFO |
| 8 | **Device info / health** (ID, location, online) | Device screen |
| 9 | **Battery and signal** (needed for 4G) | Lets us warn about a dying battery before the device goes silent |
| 10 | **Tamper / fault events** (proposed) | OEM fault trigger is already reserved in the manual |

Cylinder sizes sold in the app are 6 kg, 12.5 kg and 50 kg (others exist). The percentage on the gauge needs the **full gas capacity of the cylinder on the platform**, which the device does not know today (see open question 1).

## 3. Hardware context (from `hardware/enclosure/README.md`, prototype v0)

- 4 load cells under a 460 x 460 mm top plate; electronics in a sealed pod (IP65 target): battery tray, controller board, 4G modem.
- Pod has an SMA bulkhead for the 4G antenna and two LED windows.
- Battery: 2x D-size cells. The note flags that a Li-SOCl2 primary cell **cannot supply LTE current peaks alone**, so a supercap or hybrid layer capacitor is needed in front of the modem.
- The old HX711 concept is dropped; an industrial 24-bit bridge ADC (ADS1232 / ADS1256 / NAU7802 class) is preferred for outdoor temperature swings.
- Almost every dimension and part there is an assumption. You are free to change them.

**Design consequence:** this is a battery-powered outdoor device that should sleep almost all the time. Everything below is shaped by that: the device initiates all 4G traffic, and the server never expects to reach it on demand.

---

## 4. Variant A: USSD / SMS device **[EXISTS]**

### 4.1 How it actually works today

Despite the name, the "USSD" commands are **ordinary SMS messages** sent to the SIM number in the device. The backend sends them through the Termii SMS gateway (`gas-monitor-backend/src/services/termii-service.ts`, `sendUssdCommand` posts to `/sms/send`). The device reads the SMS, applies the command, and replies by SMS.

Command grammar (from the 4First user manual; builder in `src/lib/ussd-handler.ts`):

```
*<password>*<COMMAND>*<params>#
```

- Starts with `*`, ends with `#`, no spaces, case-insensitive.
- Default password `1234`. Max 4 alphanumeric characters.
- Phone numbers in local format (`08012345678`), never `+234`.

| Command | Format | Device reply |
|---|---|---|
| USER | `*1234*USER*0801…*0801…#` (number sent twice) | `USER NUMBER SAVED` |
| PASSWORD | `*old*PASSWORD*new#` | `DEVICE ID SAVED` |
| INFO | `*1234*INFO#` | `4FIRST TECHNOLOGIES LIMITED OWERRI IMO STATE …` (company, location, status) |
| TARE | `*1234*TARE#` | `CALIBRATION COMPLETE` |
| ADDRESS | `*1234*ADDRESS*<location>#` | `ADDRESS OK` |
| MINIMUM | `*1234*MINIMUM*<1-9>#` (integer kg only) | `CRITICAL LEVEL SAVED` |
| F-MODE | `*F-MODE*F-MODE#` (manufacturer factory reset, wipes logs) | `FACTORY RESET COMPLETED` |
| OEM-TRIGGER-FAULT | reserved | none defined |

The backend recognises replies by substring (`parseUssdResponse`), so **these reply strings are effectively a contract**. If you change a reply, tell us.

The low-gas alert on this variant is an SMS the **device** sends to the number set with USER. The backend does not generate it.

### 4.2 Known gaps in the USSD path (be aware, do not build around them)

- **The backend never receives device replies.** Replies go to the Termii sender number, and no inbound webhook is implemented. The app shows a success message when Termii accepts the SMS, not when the device confirms.
- **Sensor readings in the app are mock data** (45.5 kg, 24 C, 2.5 bar). `GET /api/device/sensor/reading` sends an INFO command and returns a hardcoded value.
- A second, unused service (`src/services/ussd-service.ts`) expects an INFO reply shaped like `Weight: 45.5kg|Temp: 28C|Pressure: 0bar` and parses it. **That format is our guess, not something the manual defines.** If the INFO reply on your firmware is different, tell us what it is.
- Device settings are held in an in-memory map and lost on a backend restart.
- Every command is a billable SMS, so the backend throttles to one command per device per 15 s.
- The SMS path is **pull and poll**, which is slow and costly for continuous monitoring. This is the main reason 4G is the priority.

---

## 5. Variant B: 4G modem device **[PROPOSED]** (priority)

> **Superseded by `DEVICE_APP_INTEGRATION_DESIGN.md`**, which is the fuller design built from the product page's promises. Where the two differ (reporting modes, where alerts are decided, the shadow-config model), the design document wins. This section is kept as the first draft.

Nothing for this exists on the backend yet. Below is what we propose to build on our side; please push back on anything that does not suit the hardware. Once you agree it, it becomes the contract and we build the endpoints to match.

### 5.1 Principles

1. **Device-initiated only.** The device wakes, measures, connects, reports, then sleeps. The server never opens a connection to it.
2. **Commands ride on the reply.** When the device reports, the server's response carries any pending settings or commands (tare, new threshold). Changes therefore apply on the next check-in, not instantly. The app should say "will apply on next check-in".
3. **Alerts are events, not just readings.** A low-gas crossing triggers an immediate report outside the normal schedule.
4. **Server decides what to tell the user.** The device sends facts (weight, battery, event codes). The backend sends push / in-app / SMS to the user.
5. **Tolerate being offline.** Buffer readings and send them in a batch when coverage returns.

### 5.2 Transport

Recommended for v1: **HTTPS + JSON over TLS** to the existing Express API. It needs no new infrastructure, is easy to debug, and the server stays stateless. If your modem stack makes TLS handshakes too costly in energy, say so; **MQTT over TLS** or **CoAP/DTLS with CBOR** are acceptable alternatives and we would add a gateway.

- Base URL: the production API host (confirm with us before hard-coding; keep it in a settings area you can change over the air).
- Every request carries `Authorization: Bearer <device_token>` (see provisioning).
- Time: device sends its own UTC timestamp, and the server's response includes `serverTime` so the device can correct its clock.

### 5.3 Identity and provisioning

- Each unit has a factory-programmed **`deviceId`** (printed on the unit) and a per-device **secret/token**. Today the app uses a placeholder id `FG-2024-0047`; we need your real ID scheme.
- The owner **links a device to their account in the app** by entering or scanning the `deviceId` (there is a `device-linking` screenshot in the repo). The device cannot be claimed without its id, and we plan a short claim code printed on the unit as well.
- Do not use the user's phone number as identity (the SMS variant does). The SIM's ICCID/IMEI are useful to report for support, but the token is the credential.

### 5.4 Messages

**`POST /api/device/v1/report`**, device to server.

```json
{
  "deviceId": "FG-2024-0047",
  "fw": "1.0.3",
  "seq": 1042,
  "readings": [
    { "t": "2026-11-02T06:00:00Z", "grossKg": 31.42, "tempC": 27.5 }
  ],
  "events": [
    { "t": "2026-11-02T06:00:00Z", "code": "LOW_GAS" }
  ],
  "battery": { "mV": 3580, "pct": 74 },
  "net": { "rssi": -87, "rat": "LTE-M", "ccid": "89234…" }
}
```

- `readings` can hold several entries (batch after offline).
- `seq` is a monotonically increasing counter so the server can drop duplicates when you retry.
- **Weight is sent as raw gross kilograms; the server subtracts tare and cylinder empty weight** and computes net gas and percent. That way calibration data can be corrected server-side without a firmware update. If you would rather send net, say so.

**Response** (server to device):

```json
{
  "ok": true,
  "serverTime": "2026-11-02T06:00:01Z",
  "nextReportInSec": 3600,
  "config": { "minimumKg": 3, "version": 7 },
  "commands": [ { "id": "c91", "type": "TARE" } ]
}
```

**`POST /api/device/v1/ack`**, device confirms a command or config version applied, so the app can show it as confirmed (the SMS variant cannot do this).

```json
{ "deviceId": "FG-2024-0047", "commandId": "c91", "result": "OK", "t": "…" }
```

### 5.5 Event codes (proposed)

| Code | Meaning | Who is told |
|---|---|---|
| `LOW_GAS` | Net gas fell to or below `minimumKg` | User (urgent) |
| `EMPTY` | Net gas near zero | User, offer reorder |
| `CYLINDER_CHANGED` | Large step increase in weight | Server resets history baseline |
| `TARE_DONE` | Scale zeroed | Confirms the app action |
| `LOW_BATTERY` | Below your cutoff | User and our ops |
| `TAMPER` / `FAULT` | Enclosure opened, load cell error, ADC fault | Our ops |
| `BOOT` | Device restarted (with reason) | Our ops |

### 5.6 Cadence (proposal, tune to battery budget)

| Situation | Behaviour |
|---|---|
| Normal | Measure every few minutes locally; report every 1 to 6 h, or when weight moves by more than a set amount |
| Low-gas crossing | Report immediately, then repeat hourly until a refill is seen |
| Gas actively being used (weight changing) | Optionally report more often, if the energy budget allows |
| No coverage | Buffer, retry with back-off, send the batch on reconnect |

The server may change `nextReportInSec` in each response. Keep a sane floor and ceiling in firmware so a bad value cannot drain the battery or silence the unit.

### 5.7 Settings the app can push to a 4G device

Equivalent to the SMS commands, but delivered in `config` / `commands`:

| App action | SMS equivalent | 4G delivery |
|---|---|---|
| Set alert level (1 to 9 kg, integer) | `MINIMUM` | `config.minimumKg` |
| Tare | `TARE` | command `TARE`, device acks |
| Set location label | `ADDRESS` | `config.location` (optional on 4G, display only) |
| Owner phone for fallback SMS alert | `USER` | `config.alertPhone` (optional, see 5.8) |
| Password change | `PASSWORD` | **Not needed**: the token replaces it |
| Factory reset | `F-MODE` | Manufacturer-only, **not exposed to customers** |

### 5.8 Fallback SMS alert on 4G units (decision needed)

If the cellular data session fails but the modem can still send SMS, should the device text the owner directly on a low-gas crossing? It is the most reliable alert and matches the USSD variant's behaviour, but it costs SIM credit and needs the owner's number on the device. Our lean: yes for `LOW_GAS` only. Your call on feasibility.

### 5.9 Security expectations

- TLS everywhere; verify the server certificate (pin the CA or the public key if the stack allows).
- Per-device token; revocable server-side. Tokens never appear in logs.
- Reject replayed commands (command `id` plus `seq`).
- Signed firmware images when OTA is added.
- The **`1234` default password on the SMS variant is weak**. The app prompts users to change it, but anyone who knows the SIM number can send commands. Consider a sender whitelist (accept commands only from our Termii sender id and the owner's number).

### 5.10 OTA firmware update (later)

Not in v1 of the backend, but design the bootloader for it: the `report` response can later carry `{ "fwUpdate": { "version": "…", "url": "…", "sha256": "…" } }`. A dual-bank image and a rollback on failed boot are strongly preferred given devices will sit outdoors and be hard to reach.

---

## 6. How the app uses the data (so you know what accuracy matters)

- **Gauge:** percent = net gas kg / full-cylinder gas kg. It needs good resolution near empty, because the low-gas alert is the point of the product.
- **Alert threshold:** integer 1 to 9 kg, set by the user.
- **Consumption / days left:** derived server-side from reading history. Frequent enough readings matter more than perfect single readings.
- **Cylinder change detection:** a sudden large weight increase should be reported (`CYLINDER_CHANGED`) or inferable from consecutive readings. Please keep readings timestamped and ordered.
- **Temperature:** gas weight reading drifts with the load cell's temperature, so reporting `tempC` helps us compensate server-side.
- Units shown to the user: kg (and percent). A user preference for other units exists in the app.

## 7. Open questions for you

1. **Full-cylinder reference.** How should the device (or app) know which cylinder is on the platform: the user picks a size in the app, the device auto-detects from tare weight, or both?
2. **Tare vs empty-cylinder weight.** Is "tare" the platform only (zeroed with nothing on it) or platform plus empty cylinder? We need one definition and a stored calibration factor.
3. **Resolution and accuracy** you can promise with the chosen cells/ADC over -10 to 60 C, and the expected drift.
4. **Battery life target** (months or years) and what report cadence that allows on LTE-M vs LTE Cat-1 vs NB-IoT. Which modem class are you using?
5. **INFO reply on the USSD variant:** exact text, and does it include weight? (We assumed `Weight: …|Temp: …|Pressure: …`.)
6. **Does the USSD device send its own low-gas SMS**, and with what text? We want to keep it identical, or parse it.
7. **Device ID format** and how the claim code is generated and printed.
8. **Time source:** modem network time, or server time only?
9. **Fault list:** which faults the hardware can detect (load cell open/short, ADC fault, tamper switch, over-temperature).
10. **Pressure:** the old reading shape includes `pressure`. Is there a pressure sensor, or was it a placeholder?

## 8. What we will build once this is agreed

- Device registry (Prisma tables for devices, readings, events, pending commands), replacing the in-memory map.
- The `/api/device/v1/*` endpoints above, with per-device auth and idempotency on `seq`.
- Inbound SMS webhook for the USSD variant so replies and alert texts are captured instead of ignored.
- App: real gauge, history, alert handling, device linking, "pending/confirmed" state for settings. Website parity per our project rule.
- Reorder prompt triggered from `LOW_GAS` / `EMPTY`.

## 9. Where to find things in the repo

| What | Where |
|---|---|
| USSD command builder / reply parser | `gas-monitor-backend/src/lib/ussd-handler.ts` (mirrored in `gas-monitor/lib/ussd.ts`) |
| Device REST routes (SMS path) | `gas-monitor-backend/src/routes/device.ts` |
| SMS gateway client | `gas-monitor-backend/src/services/termii-service.ts` |
| Earlier integration notes | `DEVICE_INTEGRATION_GUIDE.md` (partly out of date) |
| Mobile device screen | `gas-monitor/app/(tabs)/device.tsx`, `hooks/use-device-config.ts` |
| Enclosure CAD and hardware notes | `hardware/enclosure/` |
| Original manual | `4First Gas Monitoring User Manual (1).pdf` (not in repo; request from us) |
