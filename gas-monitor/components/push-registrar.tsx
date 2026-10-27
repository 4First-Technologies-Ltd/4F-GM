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
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  return null;
}
