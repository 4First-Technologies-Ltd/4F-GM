import { getAccessToken, getRefreshToken, saveSession, clearSession } from './storage';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9000';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'CONSUMER' | 'VENDOR';
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  vendorStatus?: VendorStatus;
  createdAt: string;
}

export interface Order {
  id: string;
  supplierName?: string;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: OrderStatus;
  paystackRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

interface ApiError {
  error: string;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean; _retry?: boolean } = {}
): Promise<T> {
  const { auth = false, _retry = false, headers = {}, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>)
  };

  if (auth) {
    const token = getAccessToken();
    if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: reqHeaders,
    ...rest
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && auth && !_retry) {
      const storedRefresh = getRefreshToken();
      if (storedRefresh) {
        try {
          const tokens = await request<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: storedRefresh })
          });
          const user = getSavedUserSafe();
          if (user) saveSession(tokens.accessToken, tokens.refreshToken, user);
          return request<T>(path, { ...options, _retry: true });
        } catch {
          clearSession();
          throw new Error('Session expired. Please sign in again.');
        }
      }
    }
    throw new Error((data as ApiError).error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

function getSavedUserSafe(): ApiUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('4fg_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  async register(name: string, email: string, password: string, role: UserRole = 'CONSUMER'): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
    saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
    } finally {
      clearSession();
    }
  },

  async me(): Promise<ApiUser> {
    const data = await request<{ user: ApiUser }>('/api/auth/me', { auth: true });
    return data.user;
  }
};

// ── Orders API ────────────────────────────────────────────────────────────────

export interface InitializeOrderPayload {
  supplierName: string;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
}

export interface InitializeOrderResult {
  orderId: string;
  reference: string;
  authorizationUrl: string;
  amount: number;
  email: string;
}

export const ordersApi = {
  async initialize(payload: InitializeOrderPayload): Promise<InitializeOrderResult> {
    return request<InitializeOrderResult>('/api/orders/initialize', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
  },

  async verify(reference: string): Promise<{ success: boolean; orderId: string; status: string }> {
    return request('/api/orders/verify', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reference })
    });
  },

  async list(): Promise<Order[]> {
    const data = await request<{ orders: Order[] }>('/api/orders', { auth: true });
    return data.orders;
  }
};
