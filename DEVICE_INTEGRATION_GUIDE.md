# 4First Gas Monitoring Device Integration Guide

## Overview

This document describes the complete integration of the 4First Gas Monitoring User Manual into the gas-monitor mobile app and backend.

## Manual Summary

The 4First device communicates via USSD commands with 8 unique operations:

| # | Command | Format | Purpose |
|---|---------|--------|---------|
| 1 | USER | `*password*USER*number*number#` | Set phone number for notifications |
| 2 | PASSWORD | `*old_pass*PASSWORD*new_pass#` | Change device password |
| 3 | INFO | `*password*INFO#` | Query device status/location |
| 4 | TARE | `*password*TARE#` | Calibrate weight scale to zero |
| 5 | ADDRESS | `*password*ADDRESS*location#` | Set device's physical location |
| 6 | MINIMUM | `*password*MINIMUM*level#` | Set critical alert threshold (1-9 kg) |
| 7 | F-MODE | `*F-MODE*F-MODE#` | Factory reset (manufacturer only) |
| 8 | OEM-TRIGGER-FAULT | — | Reserved |

**Key Rules:**
- Default password: `1234`
- Commands are **case-insensitive**
- All commands must start with `*` and end with `#`
- No spaces allowed
- Passwords: max 4 alphanumeric chars
- Minimum level: 1-9 kg integers only (no decimals)
- Phone numbers: local format (08000000000, no +234)

---

## Implementation Architecture

### Mobile App (Expo React Native)

#### New Files Created

**`lib/ussd.ts`**
- `UssdCommandBuilder` class — builds properly-formatted USSD commands
- `parseUssdResponse()` — parses device responses
- Validation for all command parameters

**`hooks/use-device-config.ts`**
- State management for device configuration
- Async handlers for each device operation
- Error handling and loading states

#### Modified Files

**`app/(tabs)/device.tsx`**
- Added Device Configuration section
- UI controls for:
  - Setting phone number
  - Setting location
  - Setting minimum alert level
  - Changing device password
  - Calibrating scale (TARE)
- Forms with validation
- Loading states and error display

**`lib/api.ts`**
- Added `sensorApi` methods:
  - `getReading()` — query current weight
  - `tare()` — calibrate scale
  - `setMinimumLevel(level)` — set alert threshold
  - `queryDeviceInfo()` — get device status
- Added `deviceApi` methods:
  - `setPhoneNumber(number)`
  - `setLocation(name)`
  - `changePassword(old, new)`
  - `factoryReset()`
  - `getConfig()` / `saveConfig(config)`

### Backend (Express + Node.js)

#### New Files Created

**`src/routes/device.ts`**
- RESTful endpoints wrapping USSD commands
- All endpoints require Bearer token authentication
- Validates all inputs before building USSD commands
- Mock responses (ready for real device integration)

**`src/lib/ussd-handler.ts`**
- Backend version of USSD command builder
- Mirrors mobile app implementation
- Shared validation logic

#### Modified Files

**`src/app.ts`**
- Imported and mounted device routes at `/api/device`

### API Endpoints

All endpoints require `Authorization: Bearer {accessToken}`

#### Sensor Endpoints

```
GET  /api/device/sensor/reading      — Get weight reading
POST /api/device/sensor/tare         — Calibrate scale
POST /api/device/sensor/minimum-level — Set alert threshold
GET  /api/device/info                — Query device status
```

#### Configuration Endpoints

```
POST /api/device/config/phone        — Set phone number
POST /api/device/config/location     — Set location
POST /api/device/config/password     — Change password
POST /api/device/factory-reset       — Factory reset
GET  /api/device/config              — Get saved config
POST /api/device/config              — Save config locally
```

---

## User Flow

### Setting Up Device Notifications

1. User opens Device tab → Device Configuration
2. Taps "Phone Number"
3. Enters phone number (local format: 08000000000)
4. App sends: `POST /api/device/config/phone` with number
5. Backend formats USSD: `*1234*USER*08000000000*08000000000#`
6. Device responds: "USER NUMBER SAVED"
7. Config saved locally on backend

### Calibrating the Scale

1. User taps "Scale Calibration → Calibrate Scale (TARE)"
2. App sends: `POST /api/device/sensor/tare`
3. Backend formats USSD: `*1234*TARE#`
4. Device responds: "CALIBRATION COMPLETE"
5. Alert shown to user

### Setting Minimum Alert Level

1. User opens Device Configuration → Minimum Alert Level
2. Enters value 1-9 (e.g., 2 kg)
3. App sends: `POST /api/device/sensor/minimum-level` with level=2
4. Backend formats USSD: `*1234*MINIMUM*2#`
5. Device responds: "CRITICAL LEVEL SAVED"

---

## Current Status & Next Steps

### ✅ Completed

- ✅ USSD command builder and parser (mobile + backend)
- ✅ Device configuration UI in mobile app
- ✅ API endpoints for all 6 user-facing commands
- ✅ Input validation (passwords, levels, phone numbers)
- ✅ Error handling and user feedback
- ✅ State management with hooks
- ✅ Loading indicators and disabled states

### 🚧 TODO: Real Device Integration

The current implementation uses **mock responses**. To wire up the actual device:

1. **Replace mock responses in backend**
   - Implement actual USSD sending via device gateway
   - Handle device communication (timeout, retry logic)
   - Log all commands and responses

2. **Persist device config to database**
   - Create `DeviceConfig` table in Prisma schema
   - Replace in-memory `Map` storage with DB queries
   - Track when config was last updated

3. **Add device communication layer**
   - SMS/USSD gateway integration (e.g., AfricasTalking, Twilio)
   - Handle device responses asynchronously
   - Implement timeout handling (device may take time to respond)

4. **Error handling**
   - Parse device error responses
   - Distinguish between network errors vs device errors
   - Retry logic for transient failures

5. **Real-time sensor data**
   - Implement polling or push mechanism for sensor readings
   - Store readings in database for history/analytics
   - Update mobile app UI with live data

6. **Testing**
   - Unit tests for USSD command building
   - Integration tests with mock device responses
   - E2E tests with real device

---

## Device Response Examples

| Command | Response | Meaning |
|---------|----------|---------|
| `*1234*USER*08000000000*08000000000#` | USER NUMBER SAVED | Phone registered |
| `*1234*TARE#` | CALIBRATION COMPLETE | Scale zeroed |
| `*1234*MINIMUM*2#` | CRITICAL LEVEL SAVED | Threshold set to 2kg |
| `*1234*ADDRESS*Main Warehouse#` | ADDRESS OK | Location saved |
| `*old*PASSWORD*new#` | DEVICE ID SAVED | Password changed |
| `*1234*INFO#` | 4FIRST TECHNOLOGIES LIMITED OWERRI... | Device status |
| `*F-MODE*F-MODE#` | FACTORY RESET COMPLETED | Device reset to defaults |

---

## Testing

### Manual Testing Checklist

- [ ] Open Device tab on mobile app
- [ ] Sensor readings display (mock data)
- [ ] Tap "Phone Number" → enter number → save
- [ ] Verify success message appears
- [ ] Tap "Location" → enter location → save
- [ ] Tap "Minimum Alert Level" → enter 1-9 → save
- [ ] Tap "Change Password" → enter old/new → save
- [ ] Tap "Calibrate Scale (TARE)" → verify response
- [ ] Test validation errors (e.g., level >9)
- [ ] Test loading states while request in flight
- [ ] Test error handling (mock bad response)

### Testing with Backend

```bash
# Start backend
cd gas-monitor-backend
npm run dev

# In another terminal, test device endpoints
curl -X GET http://localhost:9000/api/device/info \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X POST http://localhost:9000/api/device/config/phone \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08000000000"}'
```

---

## Security Considerations

1. **Password handling** — Don't log device passwords; only log when changed
2. **Phone numbers** — Validate format before sending to device
3. **USSD commands** — All sent over authenticated HTTPS only
4. **Device password** — Users should change from default (1234)
5. **Minimum level** — Validated server-side (1-9 range enforced)

---

## File Structure Summary

```
gas-monitor/
├── lib/
│   ├── ussd.ts                          ← USSD command builder
│   └── api.ts                           ← Updated with device APIs
├── hooks/
│   └── use-device-config.ts             ← Device config state hook
└── app/(tabs)/
    └── device.tsx                       ← Updated with device config UI

gas-monitor-backend/
├── src/
│   ├── routes/
│   │   └── device.ts                    ← Device API endpoints
│   ├── lib/
│   │   └── ussd-handler.ts              ← USSD command builder (backend)
│   └── app.ts                           ← Updated to mount device routes
```

---

## References

- Manual: `C:\Users\Okonk\Downloads\4First Gas Monitoring User Manual (1).pdf`
- CLAUDE.md: Device configuration and routing guidelines
- Mobile CLAUDE.md: Sensor API documentation

---

## Questions?

- Check the mobile app's `app/(tabs)/device.tsx` for UI implementation
- Check `lib/ussd.ts` for USSD command format
- Check backend `src/routes/device.ts` for endpoint logic
