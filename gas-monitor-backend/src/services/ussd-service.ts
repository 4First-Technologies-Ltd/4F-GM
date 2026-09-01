/**
 * USSD Service - Backend
 * 
 * File location: gas-monitor-backend/src/services/ussd-service.ts
 * 
 * Handles all communication with 4FIRST Gas Monitoring device via USSD.
 * Uses Termii SMS gateway to send commands and capture responses.
 */

import axios from 'axios';

interface USSDResponse {
  weight: number;
  temperature?: number;
  pressure?: number;
  timestamp: string;
  status: 'success' | 'timeout' | 'error';
  rawResponse?: string;
}

export class USSDService {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number = 25000; // USSD response window in ms

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.TERMII_API_KEY || '';
    this.baseUrl = baseUrl || process.env.TERMII_BASE_URL || 'https://api.termii.com/api';

    if (!this.apiKey) {
      console.warn('TERMII_API_KEY not configured. USSD queries will fail.');
    }
  }

  /**
   * Query device weight and sensor data via USSD
   * 
   * Sends: *1234*INFO#
   * Expected response format: "Weight: 45.5kg|Temp: 28C|Pressure: 0bar"
   * 
   * @param devicePhone Device phone number (e.g., +2348012345678)
   * @returns USSDResponse with weight, temperature, and status
   */
  async queryDeviceWeight(devicePhone: string): Promise<USSDResponse> {
    try {
      if (!this.apiKey) {
        throw new Error('TERMII_API_KEY not configured');
      }

      const response = await axios.post(
        `${this.baseUrl}/ussd/send`,
        {
          msisdn: devicePhone,
          ussd_code: '*1234*INFO#', // 4First INFO command
          api_key: this.apiKey,
        },
        { timeout: this.timeout }
      );

      // Check if request was successful
      if (!response.data.success) {
        return {
          weight: 0,
          timestamp: new Date().toISOString(),
          status: 'error',
          rawResponse: response.data.message || 'Device did not respond',
        };
      }

      // Parse the device response
      const parsed = this.parseDeviceResponse(response.data.response);

      return {
        weight: parsed.weight,
        temperature: parsed.temperature,
        pressure: parsed.pressure,
        timestamp: new Date().toISOString(),
        status: 'success',
        rawResponse: response.data.response,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        weight: 0,
        timestamp: new Date().toISOString(),
        status: error instanceof axios.AxiosError && error.code === 'ECONNABORTED' ? 'timeout' : 'error',
        rawResponse: message,
      };
    }
  }

  /**
   * Tare (calibrate) the weight scale to zero
   * Sends: *1234*TARE#
   * Device should respond: "CALIBRATION COMPLETE"
   */
  async tareScale(devicePhone: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.apiKey) {
        return { success: false, message: 'TERMII_API_KEY not configured' };
      }

      const response = await axios.post(
        `${this.baseUrl}/ussd/send`,
        {
          msisdn: devicePhone,
          ussd_code: '*1234*TARE#',
          api_key: this.apiKey,
        },
        { timeout: this.timeout }
      );

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'TARE command failed',
        };
      }

      return {
        success: true,
        message: response.data.response || 'Scale calibrated',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TARE command failed';
      return { success: false, message };
    }
  }

  /**
   * Set critical low-level threshold
   * Sends: *1234*MINIMUM*{level}#
   * 
   * @param devicePhone Device phone number
   * @param level Threshold in kg (1-9, integers only)
   */
  async setMinimumLevel(
    devicePhone: string,
    level: number
  ): Promise<{ success: boolean; message: string }> {
    // Validate input
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      return {
        success: false,
        message: 'Minimum level must be an integer between 1 and 9 kg (no decimals)',
      };
    }

    try {
      if (!this.apiKey) {
        return { success: false, message: 'TERMII_API_KEY not configured' };
      }

      const response = await axios.post(
        `${this.baseUrl}/ussd/send`,
        {
          msisdn: devicePhone,
          ussd_code: `*1234*MINIMUM*${level}#`,
          api_key: this.apiKey,
        },
        { timeout: this.timeout }
      );

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'MINIMUM command failed',
        };
      }

      return {
        success: true,
        message: response.data.response || `Critical level set to ${level}kg`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MINIMUM command failed';
      return { success: false, message };
    }
  }

  /**
   * Parse USSD device response
   * 
   * Device responds with format like:
   * "Weight: 45.5kg|Temp: 28C|Pressure: 0bar"
   * 
   * This function extracts numeric values safely.
   */
  private parseDeviceResponse(response: string): {
    weight: number;
    temperature?: number;
    pressure?: number;
  } {
    const result = {
      weight: 0,
      temperature: undefined,
      pressure: undefined,
    };

    try {
      // Weight: 45.5kg
      const weightMatch = response.match(/[Ww]eight:\s*([\d.]+)/);
      if (weightMatch && weightMatch[1]) {
        result.weight = parseFloat(weightMatch[1]);
      }

      // Temp: 28C
      const tempMatch = response.match(/[Tt]emp(erature)?:\s*([\d.]+)/);
      if (tempMatch && tempMatch[2]) {
        result.temperature = parseFloat(tempMatch[2]);
      }

      // Pressure: 0bar
      const pressureMatch = response.match(/[Pp]ressure:\s*([\d.]+)/);
      if (pressureMatch && pressureMatch[1]) {
        result.pressure = parseFloat(pressureMatch[1]);
      }
    } catch (error) {
      console.error('Error parsing device response:', error);
    }

    return result;
  }
}

// Export singleton instance
export const ussdService = new USSDService();
