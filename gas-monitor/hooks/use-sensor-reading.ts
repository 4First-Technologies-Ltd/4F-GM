import { useState, useCallback } from 'react';
import { sensorApi, SensorReading } from '@/lib/api';

/**
 * Hook for querying device weight sensor via USSD
 * 
 * Usage:
 * ```tsx
 * const { reading, loading, error, fetch } = useSensorReading();
 * 
 * useEffect(() => {
 *   fetch(); // Initial fetch
 * }, []);
 * ```
 */
export function useSensorReading() {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    // Prevent rapid-fire requests (rate limiting)
    if (lastFetchTime && Date.now() - lastFetchTime < 5000) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await sensorApi.getReading();

      if (data.status === 'success') {
        setReading(data);
        setError(null);
      } else if (data.status === 'timeout') {
        setError('Device did not respond. Check device connectivity.');
      } else {
        setError(data.rawResponse || 'Failed to read sensor');
      }

      setLastFetchTime(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);

      // Handle specific error codes
      if (message.includes('NO_DEVICE_CONFIGURED')) {
        setError('Device phone not configured. Go to Settings to configure.');
      } else if (message.includes('401')) {
        setError('Session expired. Please sign in again.');
      }
    } finally {
      setLoading(false);
    }
  }, [lastFetchTime]);

  const retry = useCallback(() => {
    setError(null);
    fetch();
  }, [fetch]);

  return {
    reading,
    loading,
    error,
    fetch,
    retry,
    setError,
    lastFetchTime,
  };
}
