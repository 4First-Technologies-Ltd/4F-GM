/**
 * Sensor API Routes - Backend
 * 
 * File location: gas-monitor-backend/src/routes/api/sensor.ts
 * 
 * Endpoints:
 *   GET  /api/sensor/reading          - Query device weight
 *   POST /api/sensor/tare             - Calibrate scale
 *   POST /api/sensor/minimum-level    - Set alert threshold
 */

import { Router, Request, Response } from 'express';
import { ussdService, USSDResponse } from '../../services/ussd-service';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * GET /api/sensor/reading
 * 
 * Query device weight sensor via USSD
 * 
 * Response:
 * {
 *   "weight": 45.5,
 *   "temperature": 28,
 *   "pressure": 0,
 *   "timestamp": "2024-08-31T12:00:00Z",
 *   "status": "success",
 *   "rawResponse": "Weight: 45.5kg|Temp: 28C|Pressure: 0bar"
 * }
 */
router.get('/reading', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    // Get user's device phone number from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { devicePhone: true },
    });

    if (!user?.devicePhone) {
      return res.status(400).json({
        error: 'Device phone not configured. Please add device phone in settings.',
        code: 'NO_DEVICE_CONFIGURED',
      });
    }

    // Query device with retry logic (up to 2 retries on timeout)
    // The loop below always runs at least once, so result is assigned before use.
    let result!: USSDResponse;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await ussdService.queryDeviceWeight(user.devicePhone);

      if (result.status === 'success') {
        break; // Got a successful response, no need to retry
      }

      if (attempt < 2) {
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Return result (success or failure)
    const statusCode = result.status === 'success' ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('GET /api/sensor/reading error:', error);
    return res.status(500).json({
      error: 'Failed to query sensor',
      status: 'error',
      weight: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/sensor/tare
 * 
 * Calibrate the weight scale to zero
 * 
 * Request body: (empty)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Scale calibrated"
 * }
 */
router.post('/tare', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { devicePhone: true },
    });

    if (!user?.devicePhone) {
      return res.status(400).json({
        error: 'Device phone not configured',
        code: 'NO_DEVICE_CONFIGURED',
        success: false,
      });
    }

    const result = await ussdService.tareScale(user.devicePhone);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('POST /api/sensor/tare error:', error);
    return res.status(500).json({
      success: false,
      message: 'TARE command failed',
    });
  }
});

/**
 * POST /api/sensor/minimum-level
 * 
 * Set the critical low-level alert threshold
 * 
 * Request body:
 * {
 *   "level": 2  // 1-9 kg (integer, no decimals)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Critical level set to 2kg"
 * }
 */
router.post('/minimum-level', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub;
    const { level } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    // Validate input
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 9) {
      return res.status(400).json({
        success: false,
        message: 'Level must be an integer between 1 and 9 kg',
        code: 'INVALID_LEVEL',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { devicePhone: true },
    });

    if (!user?.devicePhone) {
      return res.status(400).json({
        success: false,
        message: 'Device phone not configured',
        code: 'NO_DEVICE_CONFIGURED',
      });
    }

    const result = await ussdService.setMinimumLevel(user.devicePhone, level);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('POST /api/sensor/minimum-level error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set minimum level',
    });
  }
});

export default router;
