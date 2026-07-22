'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

type Status = 'checking' | 'online' | 'offline';

const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 4000;

const STATUS_LABEL: Record<Status, string> = {
  checking: 'Checking connection…',
  online: 'Connected to server',
  offline: 'Server unreachable'
};

export default function NetworkStatusDot() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        // no-cors: we only care whether the request reaches the server, not
        // its body — this avoids console CORS errors when the API's
        // CORS_ORIGINS allowlist doesn't include the current dev/preview origin.
        // A resolved (even opaque) response means the server answered.
        await fetch(`${API_BASE_URL}/health`, { signal: controller.signal, cache: 'no-store', mode: 'no-cors' });
        if (!cancelled) setStatus('online');
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

  return (
    <span
      className={`network-status-dot network-status-${status}`}
      role="status"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
    />
  );
}
