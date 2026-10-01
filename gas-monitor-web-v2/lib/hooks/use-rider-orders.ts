'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { riderApi, RiderOrder } from '@/lib/api';

const POLL_MS = 30_000;

/**
 * Assigned orders for the signed-in rider. With `poll`, refetches every 30s
 * while the tab is visible so new assignments appear without a manual refresh.
 */
export function useRiderOrders({ poll = false }: { poll?: boolean } = {}) {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await riderApi.getOrders();
      if (!mounted.current) return;
      setOrders(data);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load deliveries.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!poll) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, poll]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  }, [load]);

  return { orders, loading, refreshing, error, refresh, reload: load };
}
