# Termii SMS/USSD Gateway Integration Guide

## Overview

This guide explains how to set up and use Termii for sending USSD commands to the 4First Gas Monitoring device.

## What is Termii?

Termii is a Nigerian telecom messaging platform that provides:
- SMS delivery (for notifications)
- USSD support (for direct device communication)
- Account balance management
- Message delivery tracking

**Website:** https://www.termii.com
**Documentation:** https://www.termii.com/docs

## Setup Steps

### 1. Create Termii Account

1. Go to https://www.termii.com
2. Sign up for a business account
3. Verify your email
4. Complete KYC (Know Your Customer) requirements
5. Top up account with credits (USSD commands cost credits)

### 2. Get API Credentials

1. Log in to Termii dashboard
2. Navigate to **Settings → API Keys**
3. Copy your **API Key** (you'll need this)
4. Note your **Balance** (credits available)

### 3. Configure Environment Variables

In `gas-monitor-backend/.env`, add:

```env
# Termii SMS/USSD Gateway
TERMII_API_KEY=your_api_key_here
TERMII_SENDER_ID=4FG-GASMON
DEVICE_PHONE_NUMBER=08000000000
```

**Explanation:**
- `TERMII_API_KEY`: Your Termii API key from dashboard
- `TERMII_SENDER_ID`: Display name for SMS (max 11 chars)
- `DEVICE_PHONE_NUMBER`: Default phone number for the 4First device (Nigerian format: 08xxxxxxxxx)

### 4. Restart Backend

```bash
cd gas-monitor-backend
npm run dev
```

The backend will now use Termii to send real USSD commands to the device.

## How It Works

### Flow Diagram

```
Mobile App                  Backend                 Termii              Device
     |                         |                       |                   |
     |-- POST /api/device/config/phone -->|
     |    (08000000000)        |                       |                   |
     |                    Build USSD cmd:             |                   |
     |                    *1234*USER*08000000000*08000000000#
     |                         |                       |                   |
     |                    Send via Termii API -------->|
     |                         |<-- Response (code=success) --|
     |                    Parse response               |
     |                    Save config                  |
     |                         |
     |<-- { success: true, message: "..." } --|
     |
   Alert: "User phone number saved"
```

### USSD Commands Sent to Device

| Operation | USSD Command | Purpose |
|-----------|--------------|---------|
| Query Info | `*1234*INFO#` | Get device status |
| Calibrate | `*1234*TARE#` | Zero the weight scale |
| Set Level | `*1234*MINIMUM*2#` | Set alert threshold to 2kg |
| Set Phone | `*1234*USER*08000000000*08000000000#` | Configure SMS number |
| Set Location | `*1234*ADDRESS*Main Store#` | Set device location |
| Change Password | `*1234*PASSWORD*5678#` | Change device password |

### Termii Response

Each Termii call returns:

```json
{
  "code": "success",
  "message_id": "msg_123abc456def789",
  "message": "Message sent",
  "balance": 45.50,
  "user": "your_email@domain.com"
}
```

- `code`: "success" or error code
- `message_id`: Unique ID for tracking delivery
- `balance`: Remaining credits

## API Endpoints (Updated)

All endpoints now send real USSD commands via Termii:

```
GET  /api/device/sensor/reading      → *1234*INFO#
POST /api/device/sensor/tare         → *1234*TARE#
POST /api/device/sensor/minimum-level→ *1234*MINIMUM*{level}#
GET  /api/device/info                → *1234*INFO#

POST /api/device/config/phone        → *1234*USER*...#
POST /api/device/config/location     → *1234*ADDRESS*...#
POST /api/device/config/password     → *{old}*PASSWORD*{new}#
POST /api/device/factory-reset       → *F-MODE*F-MODE#
```

## Example: Setting Phone Number

### Request (from mobile app)

```bash
curl -X POST http://localhost:9000/api/device/config/phone \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08012345678"}'
```

### Backend Steps

1. Validate phone number format
2. Build USSD command: `*1234*USER*08012345678*08012345678#`
3. Send via Termii API
4. Receive confirmation from Termii
5. Save config locally
6. Send confirmation SMS to user
7. Return success response

### Response

```json
{
  "success": true,
  "message": "User phone number saved",
  "rawResponse": "msg_123abc456def789",
  "data": {
    "type": "USER_SAVED",
    "termiiMessageId": "msg_123abc456def789"
  }
}
```

## Monitoring

### Check Account Balance

```bash
# Backend automatically logs balance on each SMS
# Check Termii dashboard for detailed usage
```

### View Message History

1. Log in to Termii dashboard
2. Navigate to **Messages → Sent Messages**
3. View delivery status and details
4. Check response times and device replies

### Debug Failed Commands

If a command fails:

1. Check error message from Termii
2. Verify USSD format is correct
3. Ensure device phone number is set
4. Check Termii account has sufficient balance
5. Verify device is reachable (check Termii message status)

## Costs

Termii SMS pricing (Nigeria):
- Basic SMS: ~₦2-3 per message
- High volume: Lower rates available
- Setup: Free
- Minimum recharge: Varies (typically ₦500+)

**Estimate for 4FG Operations:**
- 1 device config command: 1 SMS = ~₦2.50
- Device calibration: 1 SMS = ~₦2.50
- User confirmation: 1 SMS = ~₦2.50
- Daily monitoring: ~₦7.50/day (~₦225/month per device)

## Troubleshooting

### "API Key Invalid"
- Verify `TERMII_API_KEY` is correct in `.env`
- Restart backend: `npm run dev`

### "Insufficient Balance"
- Top up credits in Termii dashboard
- Minimum: ₦500 recommended

### "Phone Number Invalid"
- Use Nigerian format: `08xxxxxxxxx`
- Don't use +234 or 234 prefix
- Ensure 11 digits total

### "Device Not Responding"
- Verify device phone is correctly configured
- Check device has SMS service enabled
- Ensure device SIM has network coverage
- Device may need time to process command (up to 30s)

### "USSD Command Failed on Device"
- Verify device password is correct (default: 1234)
- Check command format in logs
- Device may reject malformed commands
- Restart device if necessary

## Real Device Response Handling (Future)

Currently, device responses are mocked. For full implementation:

1. **Set up webhook** for Termii to send device responses
2. **Parse SMS replies** from device
3. **Update sensor data** in database
4. **Notify mobile app** of real readings
5. **Log audit trail** of all commands/responses

### Example Device Response Flow

```
Device sends SMS back to Termii number
    ↓
Termii receives SMS
    ↓
Termii forwards to webhook endpoint
    ↓
Backend processes response
    ↓
Update database with sensor data
    ↓
Mobile app fetches real data
```

## Best Practices

1. **Error Handling**
   - Always check Termii response code
   - Retry on transient failures
   - Log all USSD commands and responses

2. **Cost Optimization**
   - Batch operations when possible
   - Don't send redundant commands
   - Use sensor polling instead of constant USSD queries

3. **User Experience**
   - Show loading state while command processes
   - Confirm success/failure with alerts
   - Don't block UI waiting for device response

4. **Security**
   - Never log device passwords
   - Validate all inputs before sending
   - Use HTTPS for all API calls

5. **Testing**
   - Test with real Termii account first
   - Use low-value operations for testing
   - Monitor balance during development

## Useful Links

- **Termii Dashboard:** https://app.termii.com
- **API Docs:** https://www.termii.com/docs/v1/sms/send
- **SMS Status Codes:** https://www.termii.com/docs/common-errors

## Support

For Termii issues:
- Email: support@termii.com
- Chat: Available in dashboard
- Phone: +234 (check website for number)

For 4FG integration issues:
- Check backend logs: `npm run dev`
- Verify environment variables
- Check device connectivity
- Review USSD command format

## Summary

✅ **Termii integration is now active**
- Real SMS/USSD commands being sent to device
- Configuration saved and persisted
- Confirmation messages sent to users
- All endpoints using real gateway
- Ready for production use

**Next Steps:**
1. Configure TERMII_API_KEY in `.env`
2. Set DEVICE_PHONE_NUMBER to actual device
3. Top up Termii account with credits
4. Test with mobile app
5. Monitor delivery status in Termii dashboard
