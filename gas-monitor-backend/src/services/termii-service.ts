import axios, { AxiosInstance } from 'axios';

/**
 * Termii requires recipients in international format without a leading "+".
 * Converts Nigerian local numbers (0803...) to 234803... and strips "+".
 */
function toInternational(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

/** Pull the real reason out of an axios error (Termii returns it in the body). */
function describeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data;
    const detail =
      body && typeof body === 'object'
        ? (body as any).message || JSON.stringify(body)
        : body;
    return `${error.message}${detail ? ` — ${detail}` : ''}`;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export interface TermiiSendResponse {
  code: string;
  message_id: string;
  message: string;
  balance: number;
  user: string;
}

export interface TermiiUssdResponse {
  code: string;
  message_id: string;
  message: string;
  balance: number;
  user: string;
}

export interface TermiiSendUssdResponse {
  code: string;
  session_id: string;
  message: string;
}

/**
 * Termii Service - SMS & USSD Gateway Integration
 * Handles sending SMS and USSD commands to the 4First device
 */
export class TermiiService {
  private client: AxiosInstance;
  private apiKey: string;
  private senderId: string;

  constructor(apiKey: string, senderId: string = '4FG-GASMON') {
    this.apiKey = apiKey;
    this.senderId = senderId;

    this.client = axios.create({
      baseURL: 'https://api.ng.termii.com/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send SMS to a phone number
   * Used for confirming device operations and sending alerts
   */
  async sendSms(phoneNumber: string, message: string): Promise<TermiiSendResponse> {
    try {
      const response = await this.client.post<TermiiSendResponse>('/sms/send', {
        to: toInternational(phoneNumber),
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to send SMS: ${describeAxiosError(error)}`);
    }
  }

  /**
   * Send USSD command to device via SMS gateway
   * Format: *password*COMMAND*params#
   *
   * The 4First device expects USSD commands via SMS.
   * This sends the formatted command to the device's registered phone number.
   */
  async sendUssdCommand(devicePhoneNumber: string, ussdCommand: string): Promise<TermiiSendResponse> {
    try {
      const response = await this.client.post<TermiiSendResponse>('/sms/send', {
        to: toInternational(devicePhoneNumber),
        from: this.senderId,
        sms: ussdCommand,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to send USSD command: ${describeAxiosError(error)}`);
    }
  }

  /**
   * Send bulk SMS (for notifications to multiple users)
   */
  async sendBulkSms(recipients: string[], message: string): Promise<TermiiSendResponse> {
    try {
      const response = await this.client.post<TermiiSendResponse>('/sms/send/bulk', {
        to: recipients.map(toInternational),
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to send bulk SMS: ${describeAxiosError(error)}`);
    }
  }

  /**
   * Send OTP via SMS
   * Used for user verification
   */
  async sendOtp(phoneNumber: string, code: string): Promise<TermiiSendResponse> {
    const message = `Your 4FG Gas Monitor verification code is: ${code}. This code expires in 10 minutes.`;

    return this.sendSms(phoneNumber, message);
  }

  /**
   * Send device alert notification
   */
  async sendDeviceAlert(phoneNumber: string, alertMessage: string): Promise<TermiiSendResponse> {
    const message = `🚨 4FG Gas Monitor Alert: ${alertMessage}`;

    return this.sendSms(phoneNumber, message);
  }

  /**
   * Send device configuration confirmation
   */
  async sendConfigConfirmation(
    phoneNumber: string,
    configType: string,
    value: string
  ): Promise<TermiiSendResponse> {
    const message = `✓ 4FG Device Config Updated\n${configType}: ${value}\nDevice will apply changes shortly.`;

    return this.sendSms(phoneNumber, message);
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<number> {
    try {
      const response = await this.client.get('/get/balance', {
        params: {
          api_key: this.apiKey,
        },
      });

      return response.data.balance;
    } catch (error) {
      throw new Error(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify SMS delivery status
   */
  async getMessageStatus(messageId: string): Promise<any> {
    try {
      const response = await this.client.get('/message/history', {
        params: {
          message_id: messageId,
          api_key: this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to get message status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Singleton instance
 */
let termiiServiceInstance: TermiiService | null = null;

export function getTermiiService(): TermiiService {
  if (!termiiServiceInstance) {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID || '4FG-GASMON';

    if (!apiKey) {
      throw new Error('TERMII_API_KEY environment variable is required');
    }

    termiiServiceInstance = new TermiiService(apiKey, senderId);
  }

  return termiiServiceInstance;
}
