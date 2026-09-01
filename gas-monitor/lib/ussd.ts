// USSD Command formatter for 4First Gas Monitoring Device
// All commands follow format: *password*COMMAND*params#

export interface UssdCommand {
  command: string;
  params?: string[];
  password: string;
}

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

  /**
   * Build a USSD command string in format: *password*COMMAND*params#
   * All commands are case-insensitive
   */
  private buildCommand(command: string, params: string[] = []): string {
    const parts = [this.password, command, ...params].map(p => String(p).toUpperCase());
    return `*${parts.join('*')}#`;
  }

  /**
   * USER - Set phone number for device notifications
   * Format: *password*USER*number*number#
   * Both number fields must be the same and match the SIM in the device
   */
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

  /**
   * PASSWORD - Change device password
   * Format: *old_password*PASSWORD*new_password#
   * Password must be 1-4 alphanumeric characters
   */
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

  /**
   * INFO - Query device configuration and status
   * Format: *password*INFO#
   * Returns device location and module status
   */
  queryInfo(): string {
    return this.buildCommand('INFO');
  }

  /**
   * TARE - Zero the weight scale for calibration
   * Format: *password*TARE#
   * Device responds: CALIBRATION COMPLETE
   */
  calibrateTare(): string {
    return this.buildCommand('TARE');
  }

  /**
   * ADDRESS - Set device's physical location
   * Format: *password*ADDRESS*location_name#
   * Default: 4FIRST TECHNOLOGIES LIMITED OWERRI
   */
  setLocation(locationName: string): string {
    if (!locationName.trim()) {
      throw new Error('Location name cannot be empty');
    }
    return this.buildCommand('ADDRESS', [locationName]);
  }

  /**
   * MINIMUM - Set critical gas level threshold for alerts
   * Format: *password*MINIMUM*level#
   * Range: 1-9 kg (integers only, no decimals)
   * Default: 1 kg
   */
  setMinimumLevel(levelKg: number): string {
    if (!Number.isInteger(levelKg) || levelKg < 1 || levelKg > 9) {
      throw new Error('Minimum level must be an integer between 1 and 9 kg');
    }
    return this.buildCommand('MINIMUM', [String(levelKg)]);
  }

  /**
   * F-MODE - Factory reset (manufacturer only)
   * Format: *F-MODE*F-MODE#
   * WARNING: Clears all logs and resets password to default (1234)
   * Should not be given to clients
   */
  factoryReset(): string {
    return `*F-MODE*F-MODE#`;
  }
}

/**
 * Parse device responses
 */
export function parseUssdResponse(response: string): UssdResponse {
  if (!response) {
    return { success: false, message: 'Empty response from device', rawResponse: response };
  }

  const upperResponse = response.toUpperCase();

  // Standard success responses
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

  // INFO response - parse device location and status
  if (upperResponse.includes('4FIRST') || upperResponse.includes('LOCATION')) {
    return {
      success: true,
      message: 'Device info retrieved',
      data: { type: 'INFO', rawInfo: response },
      rawResponse: response,
    };
  }

  // Error cases
  if (upperResponse.includes('ERROR') || upperResponse.includes('INVALID')) {
    return { success: false, message: `Device error: ${response}`, rawResponse: response };
  }

  // Default parsing for unknown responses
  return {
    success: true,
    message: response,
    rawResponse: response,
  };
}

/**
 * Format command for display in UI
 */
export function formatCommandForDisplay(command: string): string {
  // Remove asterisks and hash, then format nicely
  const clean = command.replace(/[*#]/g, '');
  const parts = clean.split('*');
  if (parts.length > 1) {
    return parts.slice(1).join(' • ');
  }
  return command;
}
