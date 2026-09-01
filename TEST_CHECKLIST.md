# Device Integration Testing Checklist

## Pre-Testing Setup

- [ ] Backend is running: `cd gas-monitor-backend && npm run dev`
- [ ] Mobile app is running: `cd gas-monitor && npm start`
- [ ] You're logged in as a test user on the mobile app

## UI Verification

### Device Tab - Sensor Readings Section
- [ ] "Device" tab displays sensor readings (live data section)
- [ ] Shows "Weight Sensor" with mock value (e.g., "45.5 kg")
- [ ] Shows "Temperature" with mock value (e.g., "24°C")
- [ ] Shows "Pressure" with mock value (e.g., "2.5 bar")
- [ ] Shows "Last Updated" timestamp
- [ ] "LIVE" refresh button is clickable
- [ ] Auto-sync toggle is present and can be toggled
- [ ] Connection status shows "Connected" (green dot)

### Device Configuration Section
- [ ] New "Device Configuration" card is visible
- [ ] Shows 4 configuration options:
  - [ ] Phone Number (displays "Not set" or saved number)
  - [ ] Location (displays "Default (Owerri)" or saved location)
  - [ ] Minimum Alert Level (displays "1 kg" or saved level)
  - [ ] Change Password (displays "Reset device password")

### Scale Calibration Section
- [ ] New "Scale Calibration" card is visible
- [ ] "Calibrate Scale (TARE)" button is present and clickable

## Phone Number Configuration

1. Tap "Phone Number"
   - [ ] Form switches to phone number entry mode
   - [ ] Input field shows placeholder "08000000000"
   - [ ] "Cancel" and "Save" buttons appear

2. Enter valid phone number (08000000000)
   - [ ] "Save" button becomes active

3. Tap "Save"
   - [ ] Loading indicator appears briefly
   - [ ] Success alert: "User phone number saved"
   - [ ] Form closes and returns to config view
   - [ ] Phone Number now shows the saved number

4. Test invalid phone numbers:
   - [ ] Empty input → alert "Please enter a phone number"
   - [ ] +2348000000000 → validation should fail
   - [ ] Short number (5 digits) → validation should fail

## Location Configuration

1. Tap "Location"
   - [ ] Form switches to location entry mode
   - [ ] Input field shows placeholder
   - [ ] "Cancel" and "Save" buttons appear

2. Enter location (e.g., "Main Warehouse")
   - [ ] "Save" button becomes active

3. Tap "Save"
   - [ ] Loading indicator appears briefly
   - [ ] Success alert: "Location set successfully"
   - [ ] Form closes and returns to config view
   - [ ] Location now shows the saved location

4. Test invalid locations:
   - [ ] Empty input → alert "Please enter a location"

## Minimum Alert Level Configuration

1. Tap "Minimum Alert Level"
   - [ ] Form switches to number entry mode
   - [ ] Input field shows "1" as placeholder
   - [ ] "Cancel" and "Save" buttons appear

2. Enter valid level (e.g., 2)
   - [ ] "Save" button becomes active

3. Tap "Save"
   - [ ] Loading indicator appears briefly
   - [ ] Success alert: "Minimum level threshold set"
   - [ ] Form closes and returns to config view
   - [ ] Minimum Alert Level now shows "2 kg"

4. Test invalid levels:
   - [ ] Enter 0 → alert "Minimum level must be between 1 and 9 kg"
   - [ ] Enter 10 → alert "Minimum level must be between 1 and 9 kg"
   - [ ] Enter 2.5 → alert "Minimum level must be between 1 and 9 kg"
   - [ ] Enter "abc" → validation fails

## Change Password

1. Tap "Change Password"
   - [ ] Form switches to password entry mode
   - [ ] Two input fields appear: "Current password" and "New password"
   - [ ] Both are secureTextEntry (dots not characters)
   - [ ] "Cancel" and "Save" buttons appear

2. Enter passwords
   - [ ] Current password: "1234" (default)
   - [ ] New password: "abcd"
   - [ ] "Save" button becomes active

3. Tap "Save"
   - [ ] Loading indicator appears briefly
   - [ ] Success alert: "Device password changed"
   - [ ] Form closes and returns to config view

4. Test invalid passwords:
   - [ ] New password with 5+ chars → alert "Password must be 1-4 alphanumeric characters"
   - [ ] New password with special chars (e.g., "a@c") → alert about alphanumeric
   - [ ] Empty password → alert "Please enter both passwords"

## Scale Calibration

1. Tap "Calibrate Scale (TARE)" button
   - [ ] Loading indicator appears (circle spinner)
   - [ ] Button becomes disabled
   
2. Wait for response
   - [ ] Loading disappears
   - [ ] Alert appears: "Scale calibrated successfully" OR "Calibration: CALIBRATION COMPLETE"
   - [ ] Button becomes enabled again

## Error Handling

1. Test error display in config form
   - [ ] Intentionally cause an error (if backend validation changes)
   - [ ] Error message appears in red box below forms
   - [ ] "Dismiss" button is clickable
   - [ ] Clicking dismiss removes the error

## API Verification (Optional)

Test API endpoints directly:

```bash
# Get device config
curl -X GET http://localhost:9000/api/device/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Set phone number
curl -X POST http://localhost:9000/api/device/config/phone \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08012345678"}'

# Set location
curl -X POST http://localhost:9000/api/device/config/location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"locationName":"Main Store"}'

# Set minimum level
curl -X POST http://localhost:9000/api/device/sensor/minimum-level \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"level":3}'

# Calibrate
curl -X POST http://localhost:9000/api/device/sensor/tare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Expected responses: All should return `{ success: true, message: "..." }`

## Edge Cases

- [ ] Rapid clicks on same button → only processes one request
- [ ] Switch between different config options → forms show correct state
- [ ] Go to Device tab, wait 30s → auto-refresh happens (if toggle enabled)
- [ ] Disable auto-sync → refresh stops
- [ ] Enable auto-sync → refresh resumes every 30s
- [ ] Low battery state → if device simulation has this

## Performance

- [ ] Config forms load in <1s
- [ ] Submit responses received in <2s (mock responses)
- [ ] No console errors
- [ ] No memory leaks on repeated config changes

## Data Persistence

- [ ] Refresh app → previously set config values are retained
- [ ] Navigate away and back to Device tab → values persist
- [ ] Close and reopen app → values persist

## Styling & UX

- [ ] All text is clearly readable (good contrast)
- [ ] Input fields have clear focus state
- [ ] Buttons are large enough to tap easily
- [ ] Success/error messages are color-coded (green/red)
- [ ] Loading states are clear
- [ ] No layout breaks on different screen sizes

## Notes

- Currently using mock responses from backend
- Device is not actually receiving USSD commands
- All validation and API structure is production-ready
- See DEVICE_INTEGRATION_GUIDE.md for next steps (real device integration)

---

## Sign-Off

- [ ] All tests passed
- [ ] No console errors
- [ ] Ready for next phase (real device integration)
- [ ] Tester: _________________ Date: _______

