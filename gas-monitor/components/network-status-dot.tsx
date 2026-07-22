import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { API_BASE_URL } from '@/lib/api';

type Status = 'checking' | 'online' | 'offline';

const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 4000;

const DOT_COLOR: Record<Status, string> = {
  checking: '#AECAAE',
  online: '#2D7450',
  offline: '#D32F2F',
};

export function NetworkStatusDot() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      } finally {
        clearTimeout(timeout);
      }
    }

    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <View pointerEvents="none" style={[styles.dot, { backgroundColor: DOT_COLOR[status] }]} />;
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 10,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 10,
  },
});
