import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { UssdCommandBuilder, parseUssdResponse } from '../lib/ussd-handler';
import { getTermiiService, TermiiService, TermiiSendResponse } from '../services/termii-service';

const router = Router();

// Middleware
router.use(requireAuth);

// Store device configs in memory for now (TODO: persist to DB)
const deviceConfigs = new Map<string, any>();

// Default device phone number (will be configurable per user)
const DEFAULT_DEVICE_PHONE = process.env.DEVICE_PHONE_NUMBER || '08000000000';

// ── USSD rate limiting ───────────────────────────────────────────────────────
// Every USSD command is a billable SMS to the device. Guard against runaway
// polling (e.g. a stuck client) and double-submits with a per-device-phone
// minimum interval between commands.
const USSD_MIN_INTERVAL_MS = Number(process.env.USSD_MIN_INTERVAL_MS) || 15_000;
const lastUssdSentAt = new Map<string, number>();

function ussdThrottleRemainingMs(devicePhone: string): number {
  const last = lastUssdSentAt.get(devicePhone);
  if (!last) return 0;
  return Math.max(0, USSD_MIN_INTERVAL_MS - (Date.now() - last));
}

/**
 * Send a USSD command unless the same device phone was messaged within the
 * throttle window. Returns null when the send was skipped, so read-style
 * callers can fall back to cached/mock data and write-style callers can return
 * a 429.
 */
async function sendUssdThrottled(
  termii: TermiiService,
  devicePhone: string,
  command: string
): Promise<TermiiSendResponse | null> {
  const remaining = ussdThrottleRemainingMs(devicePhone);
  if (remaining > 0) {
    console.warn(
      `[TERMII] Throttled USSD to ${devicePhone} (${Math.ceil(remaining / 1000)}s remaining): ${command}`
    );
    return null;
  }
  // Reserve the slot before awaiting so concurrent requests can't both slip through.
  lastUssdSentAt.set(devicePhone, Date.now());
  try {
    return await termii.sendUssdCommand(devicePhone, command);
  } catch (err) {
    // A failed send shouldn't hold the lock for the full window — release most of it.
    lastUssdSentAt.set(devicePhone, Date.now() - USSD_MIN_INTERVAL_MS + 3_000);
    throw err;
  }
}

// ── Sensor APIs ──────────────────────────────────────────────────────────────

/**
 * GET /api/device/sensor/reading
 * Get current weight sensor reading
 * Sends USSD: *1234*INFO#
 */
router.get('/sensor/reading', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    // Try to send via Termii if API key is configured
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const ussdBuilder = new UssdCommandBuilder('1234');
        const command = ussdBuilder.queryInfo();
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;
        await sendUssdThrottled(termii, devicePhone, command);
      } catch (termiiErr) {
        console.error('Termii error:', termiiErr);
      }
    }

    // Return mock data (real device response would come via webhook)
    const mockReading = {
      weight: 45.5,
      temperature: 24,
      pressure: 2.5,
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      mode: process.env.TERMII_API_KEY ? 'termii' : 'mock',
    };

    res.json(mockReading);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/sensor/tare
 * Calibrate weight scale to zero
 * Sends USSD: *1234*TARE#
 */
router.post('/sensor/tare', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const ussdBuilder = new UssdCommandBuilder('1234');
    const command = ussdBuilder.calibrateTare();

    // If Termii API key is configured, REQUIRE it to work
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;

        console.log(`[TERMII] Sending TARE command to device ${devicePhone}: ${command}`);
        const termiiResponse = await sendUssdThrottled(termii, devicePhone, command);

        if (!termiiResponse) {
          return res.status(429).json({
            error: 'A command was just sent to this device. Wait a few seconds and try again.',
            termiiStatus: 'THROTTLED',
          });
        }

        if (termiiResponse.code !== 'success' && termiiResponse.code !== 'ok') {
          console.error(`[TERMII] Command failed: ${termiiResponse.code} - ${termiiResponse.message}`);
          return res.status(400).json({
            error: `Termii failed: ${termiiResponse.message}`,
            code: termiiResponse.code,
            termiiStatus: 'FAILED',
          });
        }

        console.log(`[TERMII] TARE sent successfully. Message ID: ${termiiResponse.message_id}`);

        const response = parseUssdResponse('CALIBRATION COMPLETE');
        response.data = {
          ...response.data,
          termiiMessageId: termiiResponse.message_id,
          termiiStatus: 'SUCCESS',
          mode: 'TERMII_LIVE',
        };

        res.json(response);
      } catch (termiiErr) {
        console.error('[TERMII] Error:', termiiErr);
        return res.status(400).json({
          error: `Termii error: ${termiiErr instanceof Error ? termiiErr.message : 'Unknown error'}`,
          termiiStatus: 'ERROR',
        });
      }
    } else {
      // No Termii configured - return mock response
      const response = parseUssdResponse('CALIBRATION COMPLETE');
      response.data = {
        ...response.data,
        mode: 'MOCK',
        note: '⚠️ TERMII_API_KEY not configured - using mock responses only',
      };

      res.json(response);
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/sensor/minimum-level
 * Set critical gas level threshold
 * Sends USSD: *1234*MINIMUM*{level}#
 */
router.post('/sensor/minimum-level', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ level: z.number().int().min(1).max(9) });
    const { level } = schema.parse(req.body);

    const userId = (req as any).user.sub;
    const ussdBuilder = new UssdCommandBuilder('1234');
    const command = ussdBuilder.setMinimumLevel(level);

    // If Termii API key is configured, REQUIRE it to work
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;

        console.log(`[TERMII] Sending MINIMUM command to device ${devicePhone}: ${command}`);
        const termiiResponse = await sendUssdThrottled(termii, devicePhone, command);

        if (!termiiResponse) {
          return res.status(429).json({
            error: 'A command was just sent to this device. Wait a few seconds and try again.',
            termiiStatus: 'THROTTLED',
          });
        }

        if (termiiResponse.code !== 'success' && termiiResponse.code !== 'ok') {
          console.error(`[TERMII] Command failed: ${termiiResponse.code} - ${termiiResponse.message}`);
          return res.status(400).json({
            error: `Termii failed: ${termiiResponse.message}`,
            code: termiiResponse.code,
            termiiStatus: 'FAILED',
          });
        }

        console.log(`[TERMII] MINIMUM sent successfully. Message ID: ${termiiResponse.message_id}`);

        // Save to config only after Termii succeeds
        deviceConfigs.set(`${userId}:minimum_level`, level);

        const response = parseUssdResponse('CRITICAL LEVEL SAVED');
        response.data = {
          ...response.data,
          level,
          termiiMessageId: termiiResponse.message_id,
          termiiStatus: 'SUCCESS',
          mode: 'TERMII_LIVE',
        };

        res.json(response);
      } catch (termiiErr) {
        console.error('[TERMII] Error:', termiiErr);
        return res.status(400).json({
          error: `Termii error: ${termiiErr instanceof Error ? termiiErr.message : 'Unknown error'}`,
          termiiStatus: 'ERROR',
        });
      }
    } else {
      // No Termii configured - return mock response
      deviceConfigs.set(`${userId}:minimum_level`, level);

      const response = parseUssdResponse('CRITICAL LEVEL SAVED');
      response.data = {
        ...response.data,
        level,
        mode: 'MOCK',
        note: '⚠️ TERMII_API_KEY not configured - using mock responses only',
      };

      res.json(response);
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/device/info
 * Query device configuration and status
 * Sends USSD: *1234*INFO#
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    // Try to send via Termii if API key is configured
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const ussdBuilder = new UssdCommandBuilder('1234');
        const command = ussdBuilder.queryInfo();
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;
        await sendUssdThrottled(termii, devicePhone, command);
      } catch (termiiErr) {
        console.error('Termii error:', termiiErr);
      }
    }

    // Return mock device response
    const response = parseUssdResponse('4FIRST TECHNOLOGIES LIMITED OWERRI IMO STATE - Device Status: Online');
    response.data = { ...response.data, mode: process.env.TERMII_API_KEY ? 'termii' : 'mock' };

    res.json(response);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Device Configuration APIs ────────────────────────────────────────────────

/**
 * POST /api/device/config/phone
 * Set device phone number for notifications
 * Sends USSD: *1234*USER*number*number#
 */
router.post('/config/phone', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phoneNumber: z.string().min(10).regex(/^0[0-9]{9,}$/),
    });
    const { phoneNumber } = schema.parse(req.body);

    const userId = (req as any).user.sub;
    const ussdBuilder = new UssdCommandBuilder('1234');
    const command = ussdBuilder.setUserPhone(phoneNumber);

    // If Termii API key is configured, REQUIRE it to work (don't fall back to mock)
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const devicePhone = DEFAULT_DEVICE_PHONE;

        console.log(`[TERMII] Sending USER command to device ${devicePhone}: ${command}`);
        const termiiResponse = await sendUssdThrottled(termii, devicePhone, command);

        if (!termiiResponse) {
          return res.status(429).json({
            error: 'A command was just sent to this device. Wait a few seconds and try again.',
            termiiStatus: 'THROTTLED',
          });
        }

        if (termiiResponse.code !== 'success' && termiiResponse.code !== 'ok') {
          console.error(`[TERMII] Command failed: ${termiiResponse.code} - ${termiiResponse.message}`);
          return res.status(400).json({
            error: `Termii failed: ${termiiResponse.message}`,
            code: termiiResponse.code,
            termiiStatus: 'FAILED',
          });
        }

        console.log(`[TERMII] Command sent successfully. Message ID: ${termiiResponse.message_id}`);

        // Send user confirmation SMS
        try {
          await termii.sendConfigConfirmation(phoneNumber, 'Phone Number', phoneNumber);
          console.log(`[TERMII] Confirmation SMS sent to ${phoneNumber}`);
        } catch (smsErr) {
          console.error('[TERMII] Failed to send confirmation SMS:', smsErr);
        }

        // Save to config
        deviceConfigs.set(`${userId}:phone_number`, phoneNumber);

        // Return success response with Termii details
        const response = parseUssdResponse('USER NUMBER SAVED');
        response.data = {
          ...response.data,
          termiiMessageId: termiiResponse.message_id,
          termiiStatus: 'SUCCESS',
          termiiBalance: termiiResponse.balance,
          mode: 'TERMII_LIVE',
        };

        res.json(response);
      } catch (termiiErr) {
        console.error('[TERMII] Error:', termiiErr);
        return res.status(400).json({
          error: `Termii error: ${termiiErr instanceof Error ? termiiErr.message : 'Unknown error'}`,
          termiiStatus: 'ERROR',
        });
      }
    } else {
      // No Termii configured - return mock response with warning
      deviceConfigs.set(`${userId}:phone_number`, phoneNumber);

      const response = parseUssdResponse('USER NUMBER SAVED');
      response.data = {
        ...response.data,
        mode: 'MOCK',
        note: '⚠️ TERMII_API_KEY not configured - using mock responses only',
      };

      res.json(response);
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/config/location
 * Set device's physical location
 * Sends USSD: *1234*ADDRESS*location#
 */
router.post('/config/location', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      locationName: z.string().min(1).max(100),
    });
    const { locationName } = schema.parse(req.body);

    const userId = (req as any).user.sub;

    // Try to send via Termii if API key is configured
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const ussdBuilder = new UssdCommandBuilder('1234');
        const command = ussdBuilder.setLocation(locationName);
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;
        await sendUssdThrottled(termii, devicePhone, command);
      } catch (termiiErr) {
        console.error('Termii error:', termiiErr);
      }
    }

    // Save to config
    deviceConfigs.set(`${userId}:location`, locationName);

    // Return success response
    const response = parseUssdResponse('ADDRESS OK');
    response.data = { ...response.data, location: locationName, mode: process.env.TERMII_API_KEY ? 'termii' : 'mock' };

    res.json(response);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/config/password
 * Change device password
 * Sends USSD: *old_password*PASSWORD*new_password#
 */
router.post('/config/password', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      oldPassword: z.string().min(1).max(4),
      newPassword: z.string().min(1).max(4).regex(/^[a-zA-Z0-9]{1,4}$/),
    });
    const { oldPassword, newPassword } = schema.parse(req.body);

    const userId = (req as any).user.sub;

    // Try to send via Termii if API key is configured
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const ussdBuilder = new UssdCommandBuilder(oldPassword);
        const command = ussdBuilder.changePassword(oldPassword, newPassword);
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;
        await sendUssdThrottled(termii, devicePhone, command);
      } catch (termiiErr) {
        console.error('Termii error:', termiiErr);
      }
    }

    // Save to config (note: don't actually store passwords)
    deviceConfigs.set(`${userId}:password_changed`, new Date().toISOString());

    // Return success response
    const response = parseUssdResponse('DEVICE ID SAVED');
    response.data = { ...response.data, mode: process.env.TERMII_API_KEY ? 'termii' : 'mock' };

    res.json(response);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/factory-reset
 * Factory reset device (manufacturer only)
 * WARNING: Clears all logs and resets to default password
 */
router.post('/factory-reset', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    // TODO: Add permission check - only admins
    const command = '*F-MODE*F-MODE#';

    // Try to send via Termii if API key is configured
    if (process.env.TERMII_API_KEY) {
      try {
        const termii = getTermiiService();
        const devicePhone = deviceConfigs.get(`${userId}:phone_number`) || DEFAULT_DEVICE_PHONE;
        await sendUssdThrottled(termii, devicePhone, command);
      } catch (termiiErr) {
        console.error('Termii error:', termiiErr);
      }
    }

    // Return success response
    const response = parseUssdResponse('FACTORY RESET COMPLETED');
    response.data = { ...response.data, mode: process.env.TERMII_API_KEY ? 'termii' : 'mock' };

    res.json(response);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/device/config
 * Get device configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    const config = {
      phoneNumber: deviceConfigs.get(`${userId}:phone_number`) || '',
      location: deviceConfigs.get(`${userId}:location`) || '4FIRST TECHNOLOGIES LIMITED OWERRI',
      minimumLevel: deviceConfigs.get(`${userId}:minimum_level`) || 1,
    };

    res.json(config);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/config
 * Save device configuration
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phoneNumber: z.string().optional(),
      location: z.string().optional(),
      minimumLevel: z.number().optional(),
    });
    const config = schema.parse(req.body);

    const userId = (req as any).user.sub;

    if (config.phoneNumber) deviceConfigs.set(`${userId}:phone_number`, config.phoneNumber);
    if (config.location) deviceConfigs.set(`${userId}:location`, config.location);
    if (config.minimumLevel) deviceConfigs.set(`${userId}:minimum_level`, config.minimumLevel);

    res.json(config);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Test Endpoint ────────────────────────────────────────────────────────────

/**
 * GET /api/device/test-termii
 * Test if Termii API key is configured and working
 */
router.get('/test-termii', async (req: Request, res: Response) => {
  try {
    if (!process.env.TERMII_API_KEY) {
      return res.json({
        status: 'NO_API_KEY',
        message: 'TERMII_API_KEY not configured',
        note: 'Add TERMII_API_KEY to .env to enable real SMS/USSD',
      });
    }

    try {
      const termii = getTermiiService();
      const balance = await termii.getBalance();

      return res.json({
        status: 'SUCCESS',
        message: 'Termii API key is valid and working',
        balance,
        currency: 'NGN',
        note: 'API key is properly configured and authenticated',
      });
    } catch (err) {
      return res.status(400).json({
        status: 'FAILED',
        message: 'Termii API key failed authentication',
        error: err instanceof Error ? err.message : 'Unknown error',
        note: 'Check if API key is correct and account has balance',
      });
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/device/test-sms
 * Test sending a simple SMS (not USSD) to diagnose Termii issues
 */
router.post('/test-sms', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phoneNumber: z.string().min(10),
      message: z.string().optional().default('4FG Test SMS'),
    });
    const { phoneNumber, message } = schema.parse(req.body);

    if (!process.env.TERMII_API_KEY) {
      return res.json({
        status: 'NO_API_KEY',
        message: 'TERMII_API_KEY not configured',
      });
    }

    try {
      const termii = getTermiiService();

      console.log(`[TERMII-TEST] Sending SMS to ${phoneNumber}: "${message}"`);
      const response = await termii.sendSms(phoneNumber, message);

      console.log(`[TERMII-TEST] SMS sent successfully. Message ID: ${response.message_id}`);

      return res.json({
        status: 'SUCCESS',
        message: 'SMS sent successfully',
        messageId: response.message_id,
        balance: response.balance,
        note: 'If SMS arrives, your account is working. USSD issues may be due to KYC or account verification.',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[TERMII-TEST] Error: ${errorMsg}`);

      return res.status(400).json({
        status: 'FAILED',
        message: 'SMS sending failed',
        error: errorMsg,
        diagnosis: diagnoseTermiiError(errorMsg),
        note: 'Try these solutions: 1) Check account KYC status, 2) Ensure sufficient balance, 3) Verify API key',
      });
    }
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Diagnose Termii errors
 */
function diagnoseTermiiError(error: string): string {
  if (error.includes('401') || error.includes('Unauthorized')) {
    return 'LIKELY CAUSE: Invalid API key. Check your TERMII_API_KEY in .env';
  }
  if (error.includes('400') || error.includes('Bad Request')) {
    return 'LIKELY CAUSE: Invalid phone format OR account not KYC verified. Verify your account at https://app.termii.com';
  }
  if (error.includes('422') || error.includes('Unprocessable')) {
    return 'LIKELY CAUSE: Phone number is blacklisted or invalid format. Try different number.';
  }
  if (error.includes('429') || error.includes('Rate limit')) {
    return 'LIKELY CAUSE: Too many requests. Wait a moment and try again.';
  }
  if (error.includes('500') || error.includes('Internal')) {
    return 'LIKELY CAUSE: Termii server error. Try again in a few moments.';
  }
  if (error.includes('Insufficient')) {
    return 'LIKELY CAUSE: Account has insufficient balance. Top up your Termii account.';
  }
  return 'UNKNOWN ERROR: Check backend logs for details.';
}

export default router;
