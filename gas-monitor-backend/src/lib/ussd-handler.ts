// USSD Command formatter for 4First Gas Monitoring Device
// Backend version - mirrors mobile app lib/ussd.ts

export interface UssdResponse {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  rawResponse?: string;
}

const DEFAULT_PASSWORD = '1234';

export class UssdCommandBuilder {
  private password: string;

  constructor(password: string = DEFAULT_PASSWORD) {
    this.password = password;
  }

  private buildCommand(command: string, params: string[] = []): string {
    const parts = [this.password, command, ...params].map(p => String(p).toUpperCase());
    return `*${parts.join('*')}#`;
  }

  setUserPhone(phoneNumber: string): string {
    const normalized = phoneNumber.replace(/[^0-9]/g, '');
    if (normalized.length < 10) {
      throw new Error('Phone number must be at least 10 digits');
    }
    if (normalized.startsWith('234')) {
      throw new Error('Do not use +234 or country code - use local format (08000000000)');
    }
    return this.buildCommand('USER', [normalized, normalized]);
  }

  changePassword(oldPassword: string, newPassword: string): string {
    if (newPassword.length > 4) {
      throw new Error('Password must not exceed 4 characters');
    }
    if (!/^[a-zA-Z0-9]{1,4}$/.test(newPassword)) {
      throw new Error('Password must contain only alphanumeric characters');
    }
    const parts = [oldPassword, 'PASSWORD', newPassword];
    return `*${parts.join('*')}#`;
  }

  queryInfo(): string {
    return this.buildCommand('INFO');
  }

  calibrateTare(): string {
    return this.buildCommand('TARE');
  }

  setLocation(locationName: string): string {
    if (!locationName.trim()) {
      throw new Error('Location name cannot be empty');
    }
    return this.buildCommand('ADDRESS', [locationName]);
  }

  setMinimumLevel(levelKg: number): string {
    if (!Number.isInteger(levelKg) || levelKg < 1 || levelKg > 9) {
      throw new Error('Minimum level must be an integer between 1 and 9 kg');
    }
    return this.buildCommand('MINIMUM', [String(levelKg)]);
  }

  factoryReset(): string {
    return `*F-MODE*F-MODE#`;
  }
}

export function parseUssdResponse(response: string): UssdResponse {
  if (!response) {
    return { success: false, message: 'Empty response from device', rawResponse: response };
  }

  const upperResponse = response.toUpperCase();

  if (upperResponse.includes('USER NUMBER SAVED')) {
    return { success: true, message: 'User phone number saved', data: { type: 'USER_SAVED' } };
  }

  if (upperResponse.includes('DEVICE ID SAVED')) {
    return { success: true, message: 'Device password changed', data: { type: 'PASSWORD_CHANGED' } };
  }

  if (upperResponse.includes('CALIBRATION COMPLETE')) {
    return { success: true, message: 'Scale calibrated successfully', data: { type: 'TARE_COMPLETE' } };
  }

  if (upperResponse.includes('ADDRESS OK')) {
    return { success: true, message: 'Location set successfully', data: { type: 'ADDRESS_SET' } };
  }

  if (upperResponse.includes('CRITICAL LEVEL SAVED')) {
    return { success: true, message: 'Minimum level threshold set', data: { type: 'MINIMUM_LEVEL_SET' } };
  }

  if (upperResponse.includes('FACTORY RESET COMPLETED')) {
    return { success: true, message: 'Device factory reset complete', data: { type: 'FACTORY_RESET' } };
  }

  if (upperResponse.includes('4FIRST') || upperResponse.includes('LOCATION')) {
    return {
      success: true,
      message: 'Device info retrieved',
      data: { type: 'INFO', rawInfo: response },
      rawResponse: response,
    };
  }

  if (upperResponse.includes('ERROR') || upperResponse.includes('INVALID')) {
    return { success: false, message: `Device error: ${response}`, rawResponse: response };
  }

  return {
    success: true,
    message: response,
    rawResponse: response,
  };
}
