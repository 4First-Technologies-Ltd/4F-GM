import { getAccessToken, getRefreshToken, saveSession, clearSession } from './storage';

// The API lives in the standalone gas-monitor-backend service (Express + Prisma).
// Set NEXT_PUBLIC_API_URL to its origin; defaults to the local dev backend (port 9000).
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9000';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'CONSUMER' | 'VENDOR';
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';

export type UnitPreference = 'KG' | 'LBS';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  vendorStatus?: VendorStatus;
  pushEnabled: boolean;
  emailNotifEnabled: boolean;
  smsAlertsEnabled: boolean;
  unitPreference: UnitPreference;
  createdAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  pushEnabled?: boolean;
  emailNotifEnabled?: boolean;
  smsAlertsEnabled?: boolean;
  unitPreference?: UnitPreference;
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

export interface RegisterResult {
  message: string;
  email: string;
  otp?: string;
}

export interface OtpSentResult {
  message: string;
  otp?: string;
}

interface ApiError {
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
    throw new ApiRequestError((data as ApiError).error ?? `HTTP ${res.status}`, (data as ApiError).code);
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
  async register(name: string, email: string, password: string, role: UserRole = 'CONSUMER'): Promise<RegisterResult> {
    return request<RegisterResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
  },

  async verifyOtp(email: string, otp: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });
    saveSession(data.accessToken, data.refreshToken, data.user);
    return data;
  },

  async resendOtp(email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET'): Promise<OtpSentResult> {
    return request('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose })
    });
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
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<ApiUser> {
    const data = await request<{ user: ApiUser }>('/api/auth/me', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.user;
  },

  async forgotPassword(email: string): Promise<OtpSentResult> {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async resetPassword(email: string, otp: string, password: string): Promise<{ message: string }> {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, password })
    });
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
  },

  async guestInitialize(payload: InitializeOrderPayload & { email: string; name?: string }): Promise<InitializeOrderResult> {
    return request<InitializeOrderResult>('/api/orders/guest/initialize', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async guestVerify(reference: string): Promise<{ success: boolean; orderId: string; status: string }> {
    return request('/api/orders/guest/verify', {
      method: 'POST',
      body: JSON.stringify({ reference })
    });
  }
};

// ── Vendor API ────────────────────────────────────────────────────────────────

export interface VendorDocument {
  id: string;
  url: string;
  fileName: string;
  createdAt: string;
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

export interface VendorProfile {
  id: string;
  businessName: string;
  businessAddress: string;
  bio?: string | null;
  logoUrl?: string | null;
  lat?: number;
  lng?: number;
  phone: string;
  status: VendorStatus;
  documents?: VendorDocument[];
  listings?: GasListing[];
}

export interface UpdateVendorProfilePayload {
  businessName?: string;
  businessAddress?: string;
  phone?: string;
  bio?: string | null;
  logoUrl?: string | null;
  lat?: number;
  lng?: number;
}

export interface VendorOrder extends Order {
  consumer: { id: string; name: string; email: string };
  listing?: GasListing;
}

export interface CreateVendorProfilePayload {
  businessName: string;
  businessAddress: string;
  phone: string;
  lat?: number;
  lng?: number;
}

export interface ListingPayload {
  gasType: GasType;
  customName?: string;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes?: string;
  inStock?: boolean;
}

export const vendorApi = {
  async createProfile(payload: CreateVendorProfilePayload): Promise<VendorProfile> {
    const data = await request<{ profile: VendorProfile }>('/api/vendor/profile', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async getProfile(): Promise<VendorProfile> {
    const data = await request<{ profile: VendorProfile }>('/api/vendor/me', { auth: true });
    return data.profile;
  },

  async updateProfile(payload: UpdateVendorProfilePayload): Promise<VendorProfile> {
    const data = await request<{ profile: VendorProfile }>('/api/vendor/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async uploadDocuments(documents: { url: string; fileName: string }[]): Promise<{ count: number }> {
    return request('/api/vendor/documents', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ documents })
    });
  },

  async getListings(): Promise<GasListing[]> {
    const data = await request<{ listings: GasListing[] }>('/api/vendor/listings', { auth: true });
    return data.listings;
  },

  async createListing(payload: ListingPayload): Promise<GasListing> {
    const data = await request<{ listing: GasListing }>('/api/vendor/listings', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.listing;
  },

  async updateListing(id: string, payload: Partial<ListingPayload>): Promise<GasListing> {
    const data = await request<{ listing: GasListing }>(`/api/vendor/listings/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.listing;
  },

  async deleteListing(id: string): Promise<void> {
    await request(`/api/vendor/listings/${id}`, { method: 'DELETE', auth: true });
  },

  async getOrders(): Promise<VendorOrder[]> {
    const data = await request<{ orders: VendorOrder[] }>('/api/vendor/orders', { auth: true });
    return data.orders;
  },

  async updateOrderStatus(id: string, status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED'): Promise<VendorOrder> {
    const data = await request<{ order: VendorOrder }>(`/api/vendor/orders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ status })
    });
    return data.order;
  }
};

// ── Cylinders API ─────────────────────────────────────────────────────────────

export type CylinderImageKey = '6kg' | '12.5kg' | '50kg';

export interface CylinderProfile {
  id: string;
  name: string;
  sizeKg: number;
  customSizeLabel?: string | null;
  imageKey: CylinderImageKey;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CylinderPayload {
  name: string;
  sizeKg: number;
  customSizeLabel?: string;
  imageKey: CylinderImageKey;
}

export const cylinderApi = {
  async list(): Promise<CylinderProfile[]> {
    const data = await request<{ profiles: CylinderProfile[] }>('/api/cylinders', { auth: true });
    return data.profiles;
  },

  async create(payload: CylinderPayload): Promise<CylinderProfile> {
    const data = await request<{ profile: CylinderProfile }>('/api/cylinders', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async update(id: string, payload: Partial<CylinderPayload>): Promise<CylinderProfile> {
    const data = await request<{ profile: CylinderProfile }>(`/api/cylinders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async activate(id: string): Promise<CylinderProfile> {
    const data = await request<{ profile: CylinderProfile }>(`/api/cylinders/${id}/activate`, {
      method: 'PATCH',
      auth: true
    });
    return data.profile;
  },

  async remove(id: string): Promise<void> {
    await request(`/api/cylinders/${id}`, { method: 'DELETE', auth: true });
  }
};

// ── Addresses API ─────────────────────────────────────────────────────────────

export interface Address {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressPayload {
  label: string;
  fullAddress: string;
  isDefault?: boolean;
}

export const addressApi = {
  async list(): Promise<Address[]> {
    const data = await request<{ addresses: Address[] }>('/api/addresses', { auth: true });
    return data.addresses;
  },

  async create(payload: AddressPayload): Promise<Address> {
    const data = await request<{ address: Address }>('/api/addresses', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.address;
  },

  async update(id: string, payload: Partial<AddressPayload>): Promise<Address> {
    const data = await request<{ address: Address }>(`/api/addresses/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.address;
  },

  async remove(id: string): Promise<void> {
    await request(`/api/addresses/${id}`, { method: 'DELETE', auth: true });
  }
};

// ── Analytics API ─────────────────────────────────────────────────────────────

export interface StatusBreakdownEntry {
  status: OrderStatus;
  count: number;
}

export interface ConsumerAnalytics {
  role: 'CONSUMER';
  totalSpend: number;
  totalOrders: number;
  avgOrderValue: number;
  statusBreakdown: StatusBreakdownEntry[];
  monthly: { month: string; spend: number; orders: number }[];
}

export interface VendorAnalytics {
  role: 'VENDOR';
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  statusBreakdown: StatusBreakdownEntry[];
  monthly: { month: string; revenue: number; orders: number }[];
  topListings: { id: string; name: string; orders: number; revenue: number }[];
}

export type Analytics = ConsumerAnalytics | VendorAnalytics;

export const analyticsApi = {
  async get(): Promise<Analytics> {
    return request<Analytics>('/api/analytics', { auth: true });
  }
};
