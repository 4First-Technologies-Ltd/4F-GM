import { Platform } from 'react-native';
import { getAccessToken, getRefreshToken, saveSession, clearSession } from './storage';

// ── Base URL ──────────────────────────────────────────────────────────────────
// Android emulator routes "localhost" to the emulator itself — use 10.0.2.2 to
// reach the host machine. Change to your production URL before deploying.

export const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:9000'
    : 'http://localhost:9000'
  : 'https://your-production-api.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface ApiError {
  error: string;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = false, headers = {}, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = await getAccessToken();
    if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: reqHeaders,
    ...rest,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as ApiError).error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    await saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async refresh(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      const data = await request<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
      );
      const user = await import('./storage').then((m) => m.getSavedUser());
      if (user) await saveSession(data.accessToken, data.refreshToken, user);
      return data;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    const refreshToken = await getRefreshToken();
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } finally {
      await clearSession();
    }
  },

  async me(): Promise<ApiUser> {
    const data = await request<{ user: ApiUser }>('/api/auth/me', { auth: true });
    return data.user;
  },
};
