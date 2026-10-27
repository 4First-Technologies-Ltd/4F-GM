import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { notificationsApi } from './api';
import { getAccessToken } from './storage';

/**
 * Push notifications are an extra on top of the in-app inbox: every failure here
 * (no permission, no Firebase credentials in the build, offline, an emulator) is
 * swallowed so it can never get in the way of using the app.
 */

// A message that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

/** Asks for permission (once) and tells the server which device to push to. Safe to call repeatedly. */
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    if (!(await getAccessToken())) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages from 4FG',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token === registeredToken) return;

    await notificationsApi.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
  } catch {
    /* push is optional */
  }
}

/** On sign-out: stop pushing to this phone for the account that just left. */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await notificationsApi.removePushToken(token);
  } catch {
    /* the server also drops tokens Expo reports as dead */
  }
}
