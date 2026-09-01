# Termii Verification Guide

## Quick Test: Is Termii Working?

### Step 1: Add API Key to .env

Edit `gas-monitor-backend/.env`:

```env
TERMII_API_KEY=your_actual_api_key_here
TERMII_SENDER_ID=4FG-GASMON
DEVICE_PHONE_NUMBER=08000000000
```

### Step 2: Restart Backend

```bash
cd gas-monitor-backend
npm run dev
```

### Step 3: Test API Key Validation

Run this command:

```bash
curl -X GET http://localhost:9000/api/device/test-termii \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Success Response:**
```json
{
  "status": "SUCCESS",
  "message": "Termii API key is valid and working",
  "balance": 150.50,
  "currency": "NGN",
  "note": "API key is properly configured and authenticated"
}
```

**Failure Response:**
```json
{
  "status": "FAILED",
  "message": "Termii API key failed authentication",
  "error": "Invalid API key or account not verified",
  "note": "Check if API key is correct and account has balance"
}
```

**No API Key Response:**
```json
{
  "status": "NO_API_KEY",
  "message": "TERMII_API_KEY not configured",
  "note": "Add TERMII_API_KEY to .env to enable real SMS/USSD"
}
```

---

## Step 4: Test Real SMS Sending

Once API key is verified, test in mobile app:

### Test Phone Number Configuration

1. Open mobile app → Device tab
2. Tap "Set Phone Number"
3. Enter: `08012345678`
4. Tap "Save"

**Expected Results:**
- ✅ Success alert appears
- ✅ Phone number displayed on screen
- ✅ SMS confirmation received on your phone: "✓ 4FG Device Config Updated"
- ✅ Backend logs show `[TERMII] Command sent successfully`

**If it fails:**
- ❌ Error alert appears
- ❌ Backend logs show `[TERMII] Command failed: 400...`
- Check Termii balance and account status

---

## Step 5: Monitor Backend Logs

When testing with Termii, you should see logs like:

```
[TERMII] Sending USER command to device 08000000000: *1234*USER*08012345678*08012345678#
[TERMII] Command sent successfully. Message ID: msg_abc123def456
[TERMII] Confirmation SMS sent to 08012345678
```

**Error logs look like:**
```
[TERMII] Error: request failed with status code 401
[TERMII] Command failed: 401 - Invalid API key
```

---

## Two Operation Modes

### Mock Mode (No API Key)
```bash
# .env does NOT have TERMII_API_KEY

Response:
{
  "success": true,
  "message": "User phone number saved",
  "mode": "MOCK",
  "note": "⚠️ TERMII_API_KEY not configured - using mock responses only"
}
```

### Termii Live Mode (With Valid API Key)
```bash
# .env has TERMII_API_KEY=your_key

Response:
{
  "success": true,
  "message": "User phone number saved",
  "mode": "TERMII_LIVE",
  "termiiMessageId": "msg_abc123def456",
  "termiiStatus": "SUCCESS",
  "termiiBalance": 145.75
}
```

**Key difference:**
- Mock mode: Always succeeds, no real SMS sent
- Termii live mode: Fails if API key is invalid, sends real SMS on success

---

## Verification Checklist

- [ ] Added TERMII_API_KEY to .env
- [ ] Restarted backend (`npm run dev`)
- [ ] Called GET /api/device/test-termii
- [ ] Got "SUCCESS" response with balance
- [ ] Opened mobile app Device tab
- [ ] Tested "Set Phone Number"
- [ ] Got success alert
- [ ] Received SMS confirmation
- [ ] Checked backend logs for [TERMII] messages
- [ ] Verified response shows "mode": "TERMII_LIVE"

---

## Troubleshooting

### Test returns "NO_API_KEY"
**Problem:** TERMII_API_KEY not in .env
**Solution:** 
1. Add to .env: `TERMII_API_KEY=your_key`
2. Restart backend

### Test returns "FAILED" with "Invalid API key"
**Problem:** API key is wrong or account not verified
**Solution:**
1. Go to https://app.termii.com
2. Click Settings → API Keys
3. Copy the correct API key
4. Update .env and restart

### Test returns "FAILED" with "Insufficient Balance"
**Problem:** Termii account has no credits
**Solution:**
1. Go to https://app.termii.com
2. Click Wallet → Top Up
3. Add credits (minimum ₦500)
4. Try again

### Mobile app shows error "Termii failed"
**Problem:** API key is valid but SMS sending failed
**Causes:**
- No balance
- Phone number format wrong (must be 08xxxxxxxxx)
- Device phone not configured
**Solution:**
1. Check balance: GET /api/device/test-termii
2. Verify phone format (08 + 10 digits)
3. Check backend logs for error details

### No SMS received
**Problem:** SMS was sent but didn't arrive
**Solutions:**
1. Check Termii dashboard → Messages → Sent Messages
2. Look for delivery status (Sent/Delivered/Failed)
3. If "Delivered": phone may be offline, check later
4. If "Failed": click for error details
5. Retry with different phone number

---

## Expected Costs

Each operation costs approximately:
- Set Phone: ₦2.50 (USSD) + ₦2.50 (confirmation) = ₦5
- Calibrate: ₦2.50 (USSD) = ₦2.50
- Set Level: ₦2.50 (USSD) = ₦2.50
- Set Location: ₦2.50 (USSD) = ₦2.50

**Full testing (4 operations):** ~₦20

---

## Success Indicators

✅ **You know Termii is working when:**
1. GET /api/device/test-termii returns SUCCESS
2. Balance is shown (account has credits)
3. Mobile app operations show success
4. SMS confirmations arrive on your phone
5. Backend logs show [TERMII] commands
6. Response shows "termiiStatus": "SUCCESS"

---

## Production Checklist

Before going live:
- [ ] Termii account verified (KYC complete)
- [ ] API key working (test-termii returns SUCCESS)
- [ ] Balance sufficient (₦1000+ recommended)
- [ ] Real device phone configured
- [ ] All operations tested and SMS received
- [ ] Backend logs show [TERMII] (not mock mode)
- [ ] Error handling verified

---

**Notes:**
- This guide helps you **verify** Termii is actually working
- With TERMII_API_KEY set, operations will **fail** if Termii has issues
- Without TERMII_API_KEY, operations work but use **mock responses only**
- Check backend logs to see which mode is active
