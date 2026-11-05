# 4FG Smart Gas Monitor: Firmware Integration Handoff

**For:** the embedded systems engineer
**From:** the 4FG software team
**Date:** 2 November 2026
**Scope of this document:** everything the firmware needs to know to talk to the 4FG cloud and app. It is self-contained: you do not need the other design documents to build against it.

---

## 0. Read this first

**What you are building:** a battery- or mains-powered weighing platform that a household gas cylinder (3 to 50 kg of gas) stands on, with a universal 4G modem. It measures the weight, filters it, and reports it to our cloud. It also accepts a few commands and settings sent from the user's phone through the cloud.

**What you are not building:** gas maths, alerts, forecasts, ordering. The cloud does all of that. The device reports facts; the cloud decides what they mean. This keeps firmware simple and lets us change rules without touching devices in the field.

**How it talks:** MQTT over TLS, JSON messages, to a broker we run. The app never talks to the device; it talks to the cloud, and the cloud talks to the device.

### Status of every decision in this document

| Tag | Meaning |
|---|---|
| **[FIXED]** | Implemented on our side. Change only by agreement; we will change the code to match |
| **[PROPOSED]** | Our recommendation. You may change it if hardware requires; tell us and we adapt |
| **[OPEN]** | A decision we need from you or from the business. Listed again in section 13 |

A working **device simulator** implements this contract exactly (section 11). You can run it today to see the correct message flow, and run our checks against your firmware once it talks MQTT.

---

## 1. System overview

```
 ┌───────────────────┐   MQTT/TLS :8883     ┌──────────────────────────────┐        ┌──────────────┐
 │ 4FG device        │◄────────────────────►│ 4FG cloud                    │◄──────►│ Mobile app   │
 │ MCU + 4G modem    │  data up / commands  │ broker → ingest → database   │  HTTPS │ Website      │
 └───────────────────┘  and settings down   │ rules, alerts, ordering      │        └──────────────┘
                                            └──────────────────────────────┘
```

What the user sees, and what it needs from you:

| User-facing feature | Device's part |
|---|---|
| Live gas level in kg and % | Accurate gross weight, reported regularly |
| Low-gas alert "before you run out" | Timely reports as the cylinder empties; **no alert logic on the device** |
| Usage history, forecast of days left | A steady, timestamped series of settled readings |
| "Refresh now" button | Report on request (`REPORT_NOW` command) |
| "Zero the scale" | `TARE` command |
| Alert threshold, reporting settings | Apply the retained config message |
| "Monitor offline" warning, low battery | Presence messages and `LOW_BATTERY` event |
| Detect a cylinder swap | Optional `CYLINDER_CHANGED` event; the cloud also infers it from the readings |

---

## 2. Hardware assumptions

From the enclosure prototype (`hardware/enclosure/`). Almost every number there is an assumption; change what you need and tell us what changed.

- 4 load cells under a 460 x 460 mm top plate, electronics in a sealed pod (IP65 target). Pod layout: battery tray, controller board, 4G modem. SMA bulkhead for the antenna, two LED windows.
- Platform must carry a cylinder weighing up to roughly 85 to 100 kg gross (50 kg gas plus the steel).
- Battery option: 2x D-size cells. The mechanical notes flag that a Li-SOCl2 primary cell **cannot supply LTE current peaks by itself**; a supercap or hybrid layer capacitor is needed in front of the modem.
- The HX711 from the earlier concept is dropped. An industrial 24-bit bridge ADC (ADS1232 / ADS1256 / NAU7802 class) is preferred for outdoor temperature swings.
- Outdoor operating range to design for: about -10 to 60 °C, with solar loading on the pod.

**[OPEN]** Power: battery only, mains with battery backup, or both product versions. Our recommendation is both, with one firmware. It changes how often the device can talk and how fast commands arrive (section 8).

---

## 3. What the 4G module must support

Please confirm against the module you pick. If any item is missing, tell us early; there are workarounds, but the cloud design assumes these.

| Requirement | Why |
|---|---|
| MQTT 3.1.1 client over **TLS 1.2** with server-certificate validation | Primary transport |
| **Last will** and **retained** messages | Presence and config |
| **Persistent session** (`clean session = false`) and **QoS 1** | Commands wait for the device while it is briefly offline |
| Network time at attach, or a way to set the clock | Timestamps |
| Keep-alive tuning | Battery life vs. NAT timeouts |
| SMS receive (optional) | A wake-up SMS for battery units, see section 8 |
| Enough flash or RAM for a root CA certificate | TLS |

If the module's built-in MQTT is unsuitable, the MCU can run an MQTT library over the module's TCP socket interface.

**[OPEN]** Modem class (Cat-1(bis), Cat-M1, NB-IoT). Please confirm carrier coverage and support at pilot sites with the SIM provider before choosing; we have not verified Nigerian carrier support for Cat-M1/NB-IoT.

---

## 4. Connecting to the cloud

### 4.1 Broker and credentials

| Item | Value |
|---|---|
| Host | `mqtt.4fgmonitor.com` **[PROPOSED]**; confirm before you hard-code anything. Keep it in a settings area you can change without reflashing the application |
| Port / security | 8883, TLS 1.2 or newer **[FIXED]** |
| MQTT version | 3.1.1 **[FIXED]** |
| Client id | the device id **[FIXED]** |
| Username | the device id (must equal the client id) **[FIXED]** |
| Password | the per-device secret **[FIXED]** |
| Clean session | **false** **[FIXED]** |
| Keep-alive | 60 s if mains powered, longer if battery powered (carrier NAT usually drops idle connections after several minutes, so test) **[PROPOSED]** |
| Certificate | Store the CA that signs our broker certificate. We will tell you the exact chain when the certificate is issued. Do not disable certificate validation, even in development |

**Device id format [FIXED]:** `^[A-Za-z0-9][A-Za-z0-9-]{2,31}$` (3 to 32 characters, letters, digits and hyphen). It is printed on the unit, for example `FG-2024-0047`. It becomes part of the MQTT topic, so it must never contain `/`, `+` or `#`.

### 4.2 What the broker enforces

A device may **publish only to its own `up/` topics** and **subscribe only to its own `dn/` topics**. Behaviour on a violation, which firmware must not depend on:

- A **publish** to a topic you may not use is **dropped silently**: no error and no disconnect (the broker still acknowledges it at QoS 1). It is a bug in your firmware if it ever happens.
- A **subscribe** to a topic you may not use fails with MQTT return code `0x80` in the SUBACK.
- The broker **forces the client id to equal your user name**, so connecting with another device's client id does nothing to that device.
- A device that is **revoked** in our admin panel is refused at connect (CONNACK "not authorized"). If it is already connected, its messages stop being accepted within about 30 seconds. Treat "not authorized" as a normal condition: back off (section 4.4) and keep retrying slowly rather than giving up, because a device can be un-revoked.
- The broker checks the server certificate chain you present against the CA you carry; there is no plain-text port.

### 4.3 Connect sequence [FIXED]

1. Open TLS, send CONNECT with the credentials above, `clean=false`, and a **last will**: topic `…/up/status`, payload `{"state":"offline"}`, QoS 1, retained.
2. Subscribe to `…/dn/cmd` and `…/dn/cfg` at QoS 1.
3. Publish `{"state":"online","fw":"<version>","t":"<time>"}` to `…/up/status`, QoS 1, **retained**.
4. If this is a cold boot, publish a `BOOT` event, then a telemetry report with `why:"boot"`.
5. If this is a reconnect after an outage, publish `NETWORK_RECOVERED`, then flush the buffered readings in a telemetry report with `why:"retry"`.
6. The retained config message arrives right after subscribing. Apply it if its version is newer than yours (section 6.3).

### 4.4 Reconnecting [FIXED requirement, values PROPOSED]

Use **exponential backoff with random jitter**: 1 s, 2 s, 4 s … capped at 60 s, each multiplied by a random factor between 0.5 and 1. After a regional outage thousands of devices reconnect together; without jitter they will overload the broker. Never retry in a tight loop.

---

## 5. Topics and message formats

Topic root: `4fg/v1/d/{deviceId}`. All payloads are UTF-8 JSON, compact. Timestamps are ISO 8601 UTC with a `Z` or offset, for example `2026-11-02T06:00:00Z`.

| Topic suffix | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `/up/telemetry` | device → cloud | 1 | no | Readings |
| `/up/event` | device → cloud | 1 | no | Things that happened |
| `/up/ack` | device → cloud | 1 | no | Result of a command or config |
| `/up/status` | device → cloud | 1 | **yes** | `online` / `offline` presence |
| `/dn/cmd` | cloud → device | 1 | no | Commands |
| `/dn/cfg` | cloud → device | 1 | **yes** | Desired configuration |

### 5.1 Telemetry (`up/telemetry`)

```json
{
  "v": 1,
  "seq": 20418,
  "t": "2026-11-02T06:00:00Z",
  "up": 86400,
  "r": [ { "t": "2026-11-02T05:55:00Z", "kg": 31.42, "c": 27.5, "s": 1 },
         { "t": "2026-11-02T06:00:00Z", "kg": 31.41, "c": 27.6, "s": 1 } ],
  "bat": { "mv": 3580, "pct": 74, "ext": 0 },
  "net": { "rssi": -87, "rat": "LTE" },
  "fw": "1.0.3",
  "cal": 2,
  "cfg": 8,
  "why": "heartbeat"
}
```

| Field | Type / limits | Meaning |
|---|---|---|
| `v` | must be `1` | Protocol version |
| `seq` | integer ≥ 0 | Message counter. **Must keep increasing across reboots** (store it in non-volatile memory). A resend repeats the same value |
| `t` | time | When the message was built |
| `up` | integer seconds, optional | Uptime. Lets us see unexpected resets |
| `r` | array, **1 to 48** items | Readings, oldest first |
| `r[].t` | time | When this reading was taken |
| `r[].kg` | number, -5 to 500 | **Gross weight on the platform in kg, with the platform's own zero already removed** (see section 7) |
| `r[].c` | number °C, optional | Temperature at the load cells |
| `r[].s` | `0` or `1` | `1` = the reading has settled; `0` = not (cylinder being moved, knocked, wind). Default `1` |
| `bat.mv` | integer 0 to 20000 | Battery or supply voltage in millivolts |
| `bat.pct` | integer 0 to 100, optional | Estimated charge |
| `bat.ext` | `0` or `1` | `1` = running on external power |
| `net.rssi` | integer dBm, -140 to 0 | Signal strength |
| `net.rat` | string ≤ 12 chars | Radio technology, e.g. `LTE`, `LTE-M` |
| `fw` | string ≤ 32 chars | Firmware version |
| `cal` | integer | Factory calibration version in use |
| `cfg` | integer | **Config version you currently hold.** The app shows "pending" until this matches |
| `why` | one of `heartbeat`, `change`, `event`, `refresh`, `boot`, `retry` | Why you woke and reported. Helps us tune battery use |

`seq` plus the reading times make redelivery harmless: QoS 1 may deliver a message twice and the cloud ignores the repeat.

### 5.2 Events (`up/event`)

```json
{ "v": 1, "t": "2026-11-02T06:00:00Z", "code": "CYLINDER_CHANGED", "data": { "kg": 27.3 } }
```

| Code | Raise when | `data` (suggested) |
|---|---|---|
| `BOOT` | After every reset | `{ "reason": "power_on" \| "watchdog" \| "command" \| "brownout" }` |
| `CYLINDER_CHANGED` | A cylinder was removed and a different one placed (large step, then settled) | `{ "kg": gross }` |
| `TARE_DONE` | A tare completed | |
| `LOW_BATTERY` | Voltage fell to or below `lowBatteryMv` from config (raise once, re-arm when it recovers) | `{ "mv": … }` |
| `TAMPER` | Enclosure opened, if you fit a switch | |
| `FAULT` | A hardware fault | `{ "sub": "LOADCELL_OPEN" \| "ADC" \| "OVERTEMP" \| … }` |
| `NETWORK_RECOVERED` | First successful connect after being offline | |

There is deliberately **no low-gas event**. Whether the cylinder is "low" depends on the user's threshold and the cylinder, which only the cloud knows.

### 5.3 Acknowledgements (`up/ack`)

```json
{ "cmd": "cmd_mvz4gpsqwm6o", "res": "OK", "t": "2026-11-02T06:01:03Z" }
{ "cmd": "cmd_mvz4grf0ojl0", "res": "REJECTED", "detail": "PLATFORM_NOT_EMPTY", "t": "…" }
{ "cfg": 8, "res": "OK", "t": "…" }
```

`res` is one of `OK`, `FAILED`, `EXPIRED`, `REJECTED`. `detail` is optional, at most 200 characters, and should be a short code. Always acknowledge, even failures: a command with no ack is shown to the user as "device did not respond".

### 5.4 Status (`up/status`, retained)

`{"state":"online","fw":"1.0.3","t":"…"}` on connect; `{"state":"offline"}` as the last will. If you shut down cleanly (for example a planned reboot), publish `offline` yourself first, because a clean disconnect does not fire the last will.

### 5.5 Commands (`dn/cmd`)

```json
{ "id": "cmd_mvz4gpsqwm6o", "type": "TARE", "issued": "2026-11-02T06:01:00Z", "ttl": 60, "args": {} }
```

| Type | What to do | Notes |
|---|---|---|
| `REPORT_NOW` | Take a fresh settled reading and publish telemetry with `why:"refresh"`. Ack `OK` | Powers the app's refresh. Cloud expiry 30 s |
| `TARE` | Zero the platform. **Only when the platform is empty**, otherwise ack `REJECTED` with detail `PLATFORM_NOT_EMPTY` (suggested test: gross above about 1 kg, or the cylinder detector says present). On success ack `OK`, publish `TARE_DONE`, then a telemetry report | Cloud expiry 60 s; never queued for an offline device. **[OPEN]** see question 4 |
| `REBOOT` | Ack `OK` first, publish `offline` status, then restart. A `BOOT` event with reason `command` follows | Cloud expiry 10 min |

Rules for every command **[FIXED]**:

1. **Expiry:** if the current time is later than `issued + ttl` seconds, do not act; ack `EXPIRED`. If your clock is not trustworthy, measure from the moment the message arrived instead.
2. **Duplicates:** QoS 1 can deliver a command twice. Keep the **last 20 command ids and their results in non-volatile memory**. If an id repeats, **re-publish the original ack and do not act again**.
3. **Unknown or malformed:** ack `REJECTED` if you can read the `id`. Never act on a type you do not know. In particular, **`FACTORY_RESET` and firmware update are never sent through this channel**; if one arrives, reject it.
4. Do not block the MQTT loop while executing; ack promptly.

### 5.6 Configuration (`dn/cfg`, retained)

```json
{ "version": 8, "reportEverySec": 3600, "changeStepKg": 0.5, "wakeBelowKg": 0, "lowBatteryMv": 3300 }
```

| Field | Allowed range | Meaning |
|---|---|---|
| `version` | integer ≥ 1 | Increases with every change |
| `reportEverySec` | integer, **60 to 86400** | Heartbeat interval |
| `changeStepKg` | **0.05 to 5** | Report early if the weight moved by at least this much since the last report (settled readings only) |
| `wakeBelowKg` | **0 to 150** | Report at the faster rate (at most every 15 min) while **gross** weight is below this. `0` = off. The cloud works this out from the cylinder's empty weight, since only the cloud knows it |
| `lowBatteryMv` | integer, **2500 to 4200** | Threshold for `LOW_BATTERY` |

Rules **[FIXED]**:

1. Apply a config only if `version` is **greater** than the one you hold. An equal or lower version is a retained re-delivery or stale; ignore it silently.
2. Check every value against the ranges above. If any is out of range, **do not apply any of it**; ack `{"cfg": <version>, "res":"REJECTED", "detail":"out of range"}`.
3. Store the applied config in non-volatile memory, then ack `{"cfg": <version>, "res":"OK"}`.
4. The ranges are a safety net. Keep them in firmware even if the cloud never sends anything near the limits, so a bad value can never drain the battery or silence the unit.
5. A factory-fresh device holds version 0 with defaults: `reportEverySec` 3600, `changeStepKg` 0.5, `wakeBelowKg` 0, `lowBatteryMv` 3300.

---

## 6. Device behaviour

### 6.1 Sampling and reporting **[PROPOSED]**

The simulator (section 11) implements this and is the reference.

1. Sample the weight on a fixed cadence (the simulator uses 60 s) into a RAM or flash **ring buffer of up to 48 readings**. When full, drop the oldest. Each reading carries its own timestamp and settled flag.
2. Report (publish the whole buffer, then clear it) when **any** of these happens:
   - the heartbeat interval `reportEverySec` has passed (`why:"heartbeat"`);
   - the latest **settled** reading differs from the last reported one by at least `changeStepKg` (`why:"change"`);
   - gross weight is below `wakeBelowKg` and 15 minutes (or `reportEverySec`, whichever is smaller) have passed since the last report;
   - an event worth reporting immediately occurred (`CYLINDER_CHANGED`, `TARE_DONE`) (`why:"event"`);
   - a `REPORT_NOW` command arrived (`why:"refresh"`).
3. **Never trigger a report from an unsettled reading.** While a cylinder is being lifted on or off, readings jump around; they are sent with `s:0` if at all, and must not cause "change" reports.
4. A quiet cylinder (nobody cooking, overnight) should therefore send almost nothing beyond the heartbeat. This saves battery, SIM data and cloud storage.

### 6.2 Offline behaviour **[FIXED requirement]**

If there is no connection, keep sampling into the buffer and keep trying to reconnect (section 4.4). On reconnect send one `retry` telemetry with the buffer, oldest first. If the buffer overflowed, the oldest readings are lost; that is acceptable.

### 6.3 Time

Every reading needs a UTC timestamp. Take network time from the modem when available. If you boot without a valid time, still send readings, using your best estimate, and tell us in the open questions what the clock behaviour is. The cloud records its own receive time on every message and can correct a clock that is off by minutes, but it cannot repair a clock that jumps around. Do not send timestamps from 1970.

### 6.4 Persistent data (survive reset and power loss) **[FIXED requirement]**

- `seq` counter (must never go backwards)
- applied config and its version
- last 20 command ids and results
- platform zero (tare) value and factory calibration version
- optionally the unsent reading buffer

### 6.5 Boot sequence

Self-test → read persistent data → start measuring → bring up modem → connect (section 4.3). Reasons for reset should be recorded and sent in the `BOOT` event.

---

## 7. Measurement requirements

The cloud turns your numbers into gas remaining:

```
gross kg (you)   − cylinder empty weight (cloud: stamped TW, or learned at refill)   = gas remaining
gas remaining ÷ nominal fill of the selected cylinder (6, 12.5, 50 kg …)             = percent
```

So what the cloud needs from you:

1. **`kg` is gross weight with the platform's own zero removed.** The platform on its own reads 0. Do the counts-to-kg conversion on the device using your factory calibration, and temperature-compensate if the cells need it. Report the calibration version in `cal`; if a calibration turns out wrong, we can correct history on the server.
2. **Settled flag.** Report `s:1` only when the reading is stable, for example when the spread over a short window is below a limit you choose (a few grams to tens of grams). Please document the rule you pick.
3. **Resolution matters near empty.** The product's headline feature is the low-gas warning, so accuracy and repeatability between roughly 0 and 5 kg of gas are more important than absolute accuracy at full.
4. **Temperature.** Report `c` so we can see drift.

**[OPEN]** What resolution, accuracy and drift (over -10 to 60 °C) can you commit to? One set of cells must cover both small (6 kg) and large (50 kg) cylinders; does accuracy at the small end suffer?

---

## 8. Power profiles and how fast commands arrive

The cloud design is the same for both; only latency changes.

| Profile | Connection | Command latency | Reporting |
|---|---|---|---|
| **Mains / USB with battery backup** | Stay connected continuously (keep-alive 60 s) | Seconds (the broker pushes immediately) | Can report more often, for example every few minutes when the weight is changing |
| **Battery only** | Sleep most of the time; wake on timer, wake on weight change if hardware allows, and on SMS | Next time the device is awake and connected. Because the session is persistent, the broker holds the command and delivers it on reconnect | Heartbeat of one to a few hours, event-driven otherwise |

For the battery profile, **a wake-up SMS** is an optional way to give "refresh now" a fast response: the cloud sends a short SMS to the SIM; a module that can wake the MCU on SMS then connects and reports. We will send the SMS only on user request and rate-limit it. **[OPEN]** Does the chosen module support SMS wake from deep sleep?

Commands that must not run late (`TARE`, `REPORT_NOW`) have short expiries and are never queued for an offline device, so a battery unit that sleeps will simply tell the user "device offline", not apply a stale tare hours later.

---

## 9. Provisioning and identity

**[PROPOSED]** At the factory, per unit:

1. Assign a unique device id (format in 4.1) and print it on the unit.
2. Generate a random **secret of at least 32 bytes** and a short **claim code** (human-readable, printed on the unit or its box).
3. Flash the id and secret into protected storage. Never log the secret, and do not reuse one across units.
4. Give us a file of `deviceId, secret, claimCode` (encrypted in transit). We store only a hash of each secret and of each claim code.
5. The owner links the unit to their account in the app by entering the id and claim code. The device itself needs no knowledge of the owner.

**[OPEN]** How will unique ids and secrets be injected on your production line? Can the module's secure element hold the secret?

Later we may move to per-device client certificates instead of passwords; leave room in the design for a certificate and key.

---

## 10. Security requirements

- TLS 1.2+ with server certificate validation on every connection. No "insecure" builds shipped.
- A per-device secret, stored where it cannot be read out by casual means; never printed to a debug port in release builds.
- Ignore any command that is expired, a duplicate, or of an unknown type.
- Enforce the config ranges in firmware.
- Firmware updates (later): signed images, dual-bank with rollback if the new image fails to boot. Design the bootloader for this now. We will send updates through a separate manufacturer-only path, never through `dn/cmd`.
- A tamper or enclosure-open switch is welcome; it feeds the `TAMPER` event.

---

## 11. Tools we give you

Everything is in the repository under `gas-monitor-backend/`. You need Node.js 20 or newer and `npm install` there; no database and no Docker.

```bash
npm run sim:broker                                   # a local MQTT broker (enforces the same topic rules)
npm run sim:device -- --scenario refill --speed 600  # a simulated device
npm run sim:cli -- watch                             # prints every message in both directions
npm run sim:cli -- send FG-SIM-0001 REPORT_NOW       # send a command and wait for the ack
npm run sim:cli -- config FG-SIM-0001 reportEverySec=120
npm run sim:check                                    # contract checks
```

Use it as follows:

1. **Read the message flow.** Run the broker, a simulated device and `watch`. Try the `refill`, `outage` and `lowbat` scenarios.
2. **Point your firmware at the dev broker** (`mqtt://<your-pc>:1883`, user = client id = your device id, any password) to develop before our production broker is ready. The dev broker is plain TCP, so it is for bench work only; production is TLS.
3. **Run `sim:check` with your device id** (`npm run sim:check -- <your-id>`) while your firmware is connected. It automatically covers acceptance tests 4, 5, 8, 10 and 14 below against your real device. Tests 3, 6, 7 and 9 you can drive with `sim:cli send` and `sim:cli config`; the rest are bench tests.

Full option list: `gas-monitor-backend/tools/device-simulator/README.md`. The exact schemas the cloud validates with are in `gas-monitor-backend/src/lib/deviceProtocol.ts`; if this document and that file ever disagree, tell us and we will fix the document.

### Acceptance tests your firmware must pass

| # | Test | Expected |
|---|---|---|
| 1 | Cold boot | Connects, publishes `online` (retained), `BOOT` event, a `boot` telemetry |
| 2 | Unclean disconnect (pull the antenna or the power to the modem) | Broker publishes `offline`; on return `online`, `NETWORK_RECOVERED`, one `retry` batch with the buffered readings oldest first |
| 3 | `REPORT_NOW` | Ack `OK` and a `refresh` telemetry within a few seconds |
| 4 | Same command id sent twice | Two identical acks, one action |
| 5 | Command with `issued` two minutes ago and `ttl` 30 | Ack `EXPIRED`, no action |
| 6 | `TARE` with a cylinder on the platform | Ack `REJECTED` / `PLATFORM_NOT_EMPTY`, zero unchanged |
| 7 | `TARE` with an empty platform | Ack `OK`, `TARE_DONE`, a telemetry afterwards, reading near 0 |
| 8 | `FACTORY_RESET` sent as a command | Ack `REJECTED`, nothing happens |
| 9 | New config version | Applied, persisted, `cfg` ack `OK`; survives reboot; telemetry `cfg` shows the new version |
| 10 | Config with `reportEverySec` 5 | Ack `REJECTED`, old config kept |
| 11 | Same config version re-delivered (reconnect) | Ignored silently, no ack storm |
| 12 | Reset the device repeatedly | `seq` never goes backwards; last 20 command ids still remembered |
| 13 | Place a cylinder, lift it off and put it back | No "change" reports from unsettled readings; a `CYLINDER_CHANGED` for a genuine swap |
| 14 | Forged topic (publish to another device's topic) | The message never arrives anywhere and the sender is not told. This tests the broker; make sure your firmware never does it |
| 15 | 24 hours at default settings in a stable cylinder | Telemetry count and data volume consistent with the heartbeat; battery estimate recorded |

---

## 12. The older SMS/USSD device (for context)

The first-generation device does not use a data connection. The cloud sends it **SMS commands** through the Termii gateway, in the form `*password*COMMAND*params#` (case-insensitive, no spaces, default password `1234`, maximum 4 alphanumeric characters), and the device replies by SMS. If your hardware platform will also run this older firmware, these must keep working:

| Command | Format | Reply the cloud looks for |
|---|---|---|
| USER | `*1234*USER*0801…*0801…#` | `USER NUMBER SAVED` |
| PASSWORD | `*old*PASSWORD*new#` | `DEVICE ID SAVED` |
| INFO | `*1234*INFO#` | text containing `4FIRST` or `LOCATION` |
| TARE | `*1234*TARE#` | `CALIBRATION COMPLETE` |
| ADDRESS | `*1234*ADDRESS*place#` | `ADDRESS OK` |
| MINIMUM | `*1234*MINIMUM*1-9#` (integer kg) | `CRITICAL LEVEL SAVED` |
| F-MODE | `*F-MODE*F-MODE#` (manufacturer) | `FACTORY RESET COMPLETED` |

Phone numbers use the local form (`08012345678`, never `+234`). On this device the **device itself** sends the low-gas SMS to the number set with USER, because the cloud has no data feed from it.

Known weaknesses we would like fixed in that firmware: accept commands only from the gateway's sender and the owner's number (the default password is weak); keep the reply strings above exactly, because the cloud matches on them; and, if possible, send low-gas and empty alerts also as a machine-readable line such as `4FG|FG-2024-0047|31.4|74|LOW#` so the cloud can read them. **[OPEN]** What is the exact INFO reply on that firmware, and does it include the weight?

---

## 13. Questions we need answered

1. **Power:** battery only, mains with backup, or both? Expected battery life at the default heartbeat?
2. **Module and coverage:** which module and radio class, and which carriers have you tested at pilot sites? Does it support MQTT over TLS with last-will, persistent session and QoS 1? SMS wake from deep sleep?
3. **Measurement spec:** resolution, accuracy and drift from -10 to 60 °C; settling time after placing a cylinder; one set of cells for 6 to 50 kg of gas?
4. **TARE meaning:** is the tare the empty platform only (our assumption), or platform plus an empty cylinder? How does the user zero it in practice (remove the cylinder, tap "Zero scale")? Can a field tare fail, and how?
5. **Settled rule:** what stability criterion will you use, and how long does it take?
6. **Cylinder swap detection:** can firmware flag it reliably (rapid step, then settle), or should the cloud infer it only?
7. **Buffer:** how many readings can persist in flash, and what is the overflow policy?
8. **Clock:** network time at boot? Behaviour with no network?
9. **Faults and tamper:** which faults can the hardware detect (open or shorted load cell, ADC fault, enclosure switch, over-temperature)?
10. **Pressure:** the earlier software mentioned a pressure value. Is there a pressure sensor, or do we drop it?
11. **Provisioning:** how are unique ids and secrets injected on the line? Secure element available?
12. **Firmware update:** will the bootloader support dual-bank with rollback?
13. **SIM data plan:** the monthly data per device. The cloud is built to be thrifty either way; this sets the reporting-rate ceiling.
14. **SMS/USSD firmware:** exact INFO reply format; does the device send its own low-gas SMS, and with what text?

## 14. What happens next

1. You review sections 4 to 7 and tell us what does not suit the hardware.
2. We keep the contract in `deviceProtocol.ts` aligned with whatever we agree, so the simulator and the cloud follow.
3. We build the cloud side (database, ingest, API, alerts) against the simulator in parallel, while you build firmware against the same simulator.
4. First integration test: your device on the bench against our staging broker, then `sim:check` and the acceptance table above.
5. Pilot units in the field, with the daily telemetry and battery numbers feeding back into the defaults.
