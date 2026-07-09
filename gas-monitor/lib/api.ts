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

export type UserRole = 'CONSUMER' | 'VENDOR';
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  vendorStatus?: VendorStatus;
  createdAt: string;
}

export interface VendorProfile {
  id: string;
  businessName: string;
  businessAddress: string;
  lat?: number;
  lng?: number;
  phone: string;
  status: VendorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GasListing {
  id: string;
  gasType: GasType;
  customName?: string;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes?: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorOrder {
  id: string;
  consumer: { id: string; name: string; email: string };
  listing: GasListing;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: OrderStatus;
  paystackRef?: string;
  createdAt: string;
  updatedAt: string;
}

export type CylinderImageKey = '6kg' | '12.5kg' | '50kg';

export interface CylinderProfile {
  id: string;
  name: string;
  sizeKg: number;
  customSizeLabel?: string;
  imageKey: CylinderImageKey;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  message: string;
  email: string;
  otp?: string;
}

export interface OtpSentResult {
  message: string;
  otp?: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

export class ApiRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean; _retry?: boolean } = {},
): Promise<T> {
  const { auth = false, _retry = false, headers = {}, ...rest } = options;

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
    // On 401 for an auth'd request, attempt a token refresh once then retry
    if (res.status === 401 && auth && !_retry) {
      const storedRefresh = await getRefreshToken();
      if (storedRefresh) {
        try {
          const tokens = await request<{ accessToken: string; refreshToken: string }>(
            '/api/auth/refresh',
            { method: 'POST', body: JSON.stringify({ refreshToken: storedRefresh }) },
          );
          const { getSavedUser } = await import('./storage');
          const user = await getSavedUser();
          if (user) await saveSession(tokens.accessToken, tokens.refreshToken, user);
          return request<T>(path, { ...options, _retry: true });
        } catch {
          await clearSession();
          throw new Error('Session expired. Please sign in again.');
        }
      }
    }
    throw new ApiRequestError((data as ApiError).error ?? `HTTP ${res.status}`, (data as ApiError).code);
  }

  return data as T;
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  async register(name: string, email: string, password: string, role: UserRole = 'CONSUMER'): Promise<RegisterResult> {
    return request<RegisterResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
  },

  async verifyOtp(email: string, otp: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
    await saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async resendOtp(email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET'): Promise<OtpSentResult> {
    return request('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    });
  },

  async forgotPassword(email: string): Promise<OtpSentResult> {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(email: string, otp: string, password: string): Promise<{ message: string }> {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, password }),
    });
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

// ── Vendor API ────────────────────────────────────────────────────────────────

export const vendorApi = {
  async createProfile(data: {
    businessName: string;
    businessAddress: string;
    phone: string;
    lat?: number;
    lng?: number;
  }): Promise<VendorProfile> {
    const res = await request<{ profile: VendorProfile }>('/api/vendor/profile', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  async getProfile(): Promise<VendorProfile> {
    const res = await request<{ profile: VendorProfile }>('/api/vendor/me', { auth: true });
    return res.profile;
  },

  async uploadDocuments(documents: { url: string; fileName: string }[]): Promise<void> {
    await request('/api/vendor/documents', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ documents }),
    });
  },

  async getListings(): Promise<GasListing[]> {
    const res = await request<{ listings: GasListing[] }>('/api/vendor/listings', { auth: true });
    return res.listings;
  },

  async createListing(data: {
    gasType: GasType;
    customName?: string;
    pricePerKg: number;
    cylinderSizes: string[];
    otherSizes?: string;
    inStock?: boolean;
  }): Promise<GasListing> {
    const res = await request<{ listing: GasListing }>('/api/vendor/listings', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.listing;
  },

  async updateListing(id: string, data: Partial<{
    gasType: GasType;
    customName: string;
    pricePerKg: number;
    cylinderSizes: string[];
    otherSizes: string;
    inStock: boolean;
  }>): Promise<GasListing> {
    const res = await request<{ listing: GasListing }>(`/api/vendor/listings/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.listing;
  },

  async deleteListing(id: string): Promise<void> {
    await request(`/api/vendor/listings/${id}`, { method: 'DELETE', auth: true });
  },

  async getOrders(): Promise<VendorOrder[]> {
    const res = await request<{ orders: VendorOrder[] }>('/api/vendor/orders', { auth: true });
    return res.orders;
  },

  async updateOrderStatus(id: string, status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED'): Promise<VendorOrder> {
    const res = await request<{ order: VendorOrder }>(`/api/vendor/orders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ status }),
    });
    return res.order;
  },
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
      body: JSON.stringify(payload),
    });
  },

  async verify(reference: string): Promise<{ success: boolean; orderId: string; status: string }> {
    return request('/api/orders/verify', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reference }),
    });
  },

  async list(): Promise<{ orders: any[] }> {
    return request('/api/orders', { auth: true });
  },
};

// ── Cylinder Profile API ──────────────────────────────────────────────────────

export const cylinderApi = {
  async list(): Promise<CylinderProfile[]> {
    const res = await request<{ profiles: CylinderProfile[] }>('/api/cylinders', { auth: true });
    return res.profiles;
  },

  async create(data: {
    name: string;
    sizeKg: number;
    customSizeLabel?: string;
    imageKey: CylinderImageKey;
  }): Promise<CylinderProfile> {
    const res = await request<{ profile: CylinderProfile }>('/api/cylinders', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  async update(id: string, data: Partial<{
    name: string;
    sizeKg: number;
    customSizeLabel: string;
    imageKey: CylinderImageKey;
  }>): Promise<CylinderProfile> {
    const res = await request<{ profile: CylinderProfile }>(`/api/cylinders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  async remove(id: string): Promise<void> {
    await request(`/api/cylinders/${id}`, { method: 'DELETE', auth: true });
  },

  async activate(id: string): Promise<CylinderProfile> {
    const res = await request<{ profile: CylinderProfile }>(`/api/cylinders/${id}/activate`, {
      method: 'PATCH',
      auth: true,
    });
    return res.profile;
  },
};
