import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { riderApi, RiderOrder } from '@/lib/api';
import { nextRiderAction } from '@/lib/riderOrders';

const POLL_MS = 30_000;

/**
 * Assigned orders for the signed-in rider. Refetches on focus and, while the
 * screen is focused, every 30s so new assignments appear without a manual refresh.
 */
export function useRiderOrders({ poll = false }: { poll?: boolean } = {}) {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await riderApi.getOrders();
      if (!mounted.current) return;
      setOrders(data);
      setError('');
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load deliveries.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!poll) return;
      const id = setInterval(load, POLL_MS);
      return () => clearInterval(id);
    }, [load, poll]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  }, [load]);

  return { orders, loading, refreshing, error, refresh, reload: load };
}

/** Gives a job back before pickup, after a confirm. Resolves true if it went back to the pool. */
export function releaseJob(order: RiderOrder): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Give this job back?', 'It goes back to other riders. Only do this if you cannot collect it.', [
      { text: 'Keep job', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Give back',
        style: 'destructive',
        onPress: async () => {
          try {
            await riderApi.releaseJob(order.id);
            resolve(true);
          } catch (err) {
            Alert.alert('Could not give the job back', err instanceof Error ? err.message : 'Try again.');
            resolve(false);
          }
        },
      },
    ], { onDismiss: () => resolve(false) });
  });
}

/**
 * Confirms, then marks a job as picked up. Resolves true if the status changed.
 * Delivering needs the customer's PIN: screens open `DeliveryPinModal` for that step instead.
 */
export function advanceOrder(order: RiderOrder): Promise<boolean> {
  const action = nextRiderAction(order.status);
  if (!action || action.to === 'DELIVERED') return Promise.resolve(false);

  return new Promise((resolve) => {
    Alert.alert(action.confirmTitle, action.confirmBody, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            await riderApi.updateOrderStatus(order.id, action.to);
            resolve(true);
          } catch (err) {
            Alert.alert('Could not update order', err instanceof Error ? err.message : 'Try again.');
            resolve(false);
          }
        },
      },
    ], { onDismiss: () => resolve(false) });
  });
}
