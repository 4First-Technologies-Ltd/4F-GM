import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router, useSegments } from 'expo-router';
import { registerForPush } from '@/lib/push';

/**
 * Mounted once in the root layout. Registers this phone for push whenever the
 * user lands on a new screen while signed in (sign-in has no hook of its own to
 * call), and opens the inbox when a notification is tapped.
 */
export function PushRegistrar() {
  const segments = useSegments().join('/');

  useEffect(() => {
    void registerForPush();
  }, [segments]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; action?: string; deviceId?: string } | undefined;
      // A low or empty gas alert opens the refill flow; everything else opens the inbox.
      if (data?.type === 'device_alert' && data.action === 'order') {
        router.push({ pathname: '/order', params: data.deviceId ? { deviceId: data.deviceId } : {} });
        return;
      }
      router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  return null;
}
