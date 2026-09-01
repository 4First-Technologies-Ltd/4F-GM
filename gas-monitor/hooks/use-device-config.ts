import { useState, useCallback } from 'react';
import { deviceApi, DeviceConfig, DeviceCommandResult } from '@/lib/api';

export interface UseDeviceConfigState {
  config: DeviceConfig;
  loading: boolean;
  error: string | null;
}

export function useDeviceConfig() {
  const [state, setState] = useState<UseDeviceConfigState>({
    config: {},
    loading: false,
    error: null,
  });

  const fetchConfig = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const config = await deviceApi.getConfig();
      setState(prev => ({ ...prev, config, loading: false }));
      return config;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load device configuration';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const setPhoneNumber = useCallback(async (phoneNumber: string): Promise<DeviceCommandResult> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await deviceApi.setPhoneNumber(phoneNumber);
      if (result.success) {
        setState(prev => ({
          ...prev,
          config: { ...prev.config, phoneNumber },
          loading: false,
        }));
      } else {
        setState(prev => ({ ...prev, error: result.message, loading: false }));
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set phone number';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const setLocation = useCallback(async (locationName: string): Promise<DeviceCommandResult> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await deviceApi.setLocation(locationName);
      if (result.success) {
        setState(prev => ({
          ...prev,
          config: { ...prev.config, location: locationName },
          loading: false,
        }));
      } else {
        setState(prev => ({ ...prev, error: result.message, loading: false }));
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set location';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const setMinimumLevel = useCallback(async (levelKg: number): Promise<DeviceCommandResult> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await deviceApi.setMinimumLevel(levelKg);
      if (result.success) {
        setState(prev => ({
          ...prev,
          config: { ...prev.config, minimumLevel: levelKg },
          loading: false,
        }));
      } else {
        setState(prev => ({ ...prev, error: result.message, loading: false }));
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set minimum level';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<DeviceCommandResult> => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const result = await deviceApi.changePassword(oldPassword, newPassword);
        if (result.success) {
          setState(prev => ({ ...prev, loading: false }));
        } else {
          setState(prev => ({ ...prev, error: result.message, loading: false }));
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change password';
        setState(prev => ({ ...prev, error: message, loading: false }));
        throw err;
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    fetchConfig,
    setPhoneNumber,
    setLocation,
    setMinimumLevel,
    changePassword,
    clearError,
  };
}
