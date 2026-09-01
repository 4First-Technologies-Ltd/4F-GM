'use client';

import type { ApiUser } from './api';

const ACCESS_KEY = '4fg_access_token';
const REFRESH_KEY = '4fg_refresh_token';
const USER_KEY = '4fg_user';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function saveSession(accessToken: string, refreshToken: string, user: ApiUser) {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getSavedUser(): ApiUser | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}

// ── Local-only preferences ────────────────────────────────────────────────────
// Not synced to the backend — there is no preferences endpoint yet. Stored per
// browser so the toggle state survives a refresh.

const PREFS_KEY = '4fg_prefs';

export interface UserPreferences {
  emailNotifications: boolean;
  smsAlerts: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  emailNotifications: true,
  smsAlerts: false
};

export function getPreferences(): UserPreferences {
  if (!isBrowser()) return DEFAULT_PREFERENCES;
  const raw = window.localStorage.getItem(PREFS_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
