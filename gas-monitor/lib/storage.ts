import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: '4fg_access_token',
  refreshToken: '4fg_refresh_token',
  user: '4fg_user',
} as const;

export async function saveSession(
  accessToken: string,
  refreshToken: string,
  user: object,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(user)),
  ]);
}

/** Replaces the token pair after a refresh, keeping the saved user as it is. */
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

export async function getSavedUser<T = Record<string, unknown>>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(KEYS.user);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.user),
  ]);
}
