import { Platform } from 'react-native';
import { getAccessToken, getRefreshToken, saveSession, clearSession } from './storage';
import { LEGAL_VERSION } from './legal';

// ── Base URL ──────────────────────────────────────────────────────────────────
// The API lives in the standalone gas-monitor-backend service (Express + Prisma),
// run via `npm run dev` there (port 9000). Android emulator routes "localhost" to
// the emulator itself — use 10.0.2.2 to reach the host machine.

export const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:9000'
    : 'http://localhost:9000'
  : 'https://ugo.4fgmonitor.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'CONSUMER' | 'VENDOR' | 'RIDER' | 'BRANCH_MANAGER' | 'LOGISTICS_COMPANY';
export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RiderStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export type UnitPreference = 'KG' | 'LBS';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  vendorStatus?: VendorStatus;
  /** True for a vendor who has not yet supplied the RC number admins need to approve them. */
  vendorRcNumberMissing?: boolean;
  riderStatus?: RiderStatus;
  companyStatus?: CompanyStatus;
  pushEnabled: boolean;
  emailNotifEnabled: boolean;
  smsAlertsEnabled: boolean;
  unitPreference: UnitPreference;
  createdAt: string;
}


export interface Branch {
  id: string;
  name: string;
  address: string;
  state?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone: string;
  isMain: boolean;
  isActive: boolean;
  /** Set when an admin suspended the branch; the vendor cannot undo it. */
  suspendedAt?: string | null;
  suspendedReason?: string | null;
}

export type BranchInput = {
  name: string;
  address: string;
  state?: string;
  city?: string;
  phone: string;
  lat?: number;
  lng?: number;
};

/** A branch a manager was invited to run. */
export interface StaffBranch {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  phone: string;
  isActive: boolean;
  suspendedAt?: string | null;
  vendor: { businessName: string };
}

/** Order as a branch manager sees it — customer name and phone, never email. */
export interface ManagerOrder {
  id: string;
  consumer: { id: string; name: string; phone?: string | null };
  listing: { id: string; gasType: GasType; customName?: string | null } | null;
  branch: { id: string; name: string } | null;
  assignedAt?: string | null;
  rider?: { id: string; phone: string; user: { name: string } } | null;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: OrderStatus;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  email: string;
  status: 'INVITED' | 'ACTIVE';
  expiresAt: string;
  user?: { name: string } | null;
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
  plan?: VendorPlan;
  planChangedAt?: string | null;
  planLockedUntil?: string | null;
  /** Newest first, capped server-side. */
  planChanges?: VendorPlanChange[];
  /** CAC registration number ("RC1234567"); admins need it to approve the vendor. */
  rcNumber?: string | null;
  branches?: Branch[];
  createdAt: string;
  updatedAt: string;
}

export type VendorPlan = 'BASIC' | 'GROWTH' | 'PRO';

export interface VendorPlanChange {
  id: string;
  fromPlan: VendorPlan;
  toPlan: VendorPlan;
  actor: 'VENDOR' | 'ADMIN';
  createdAt: string;
}

export interface GasListing {
  id: string;
  branchId?: string | null;
  gasType: GasType;
  customName?: string;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes?: string;
  /** Vendor can fill any quantity: customers may order by kg or by amount, not only by cylinder size. */
  sellsLoose: boolean;
  inStock: boolean;
  /** Product photo as a public URL (null = none). Set via `imageKey` on create/update. */
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An approved rider a vendor can assign. The pool is platform-wide, not vendor-owned. */
export interface AssignableRider {
  id: string;
  phone: string;
  vehicleType?: string | null;
  user: { name: string };
  /** Set when the rider rides for a logistics company. */
  company?: { companyName: string } | null;
}

export interface CompanyProfile {
  id: string;
  companyName: string;
  address: string;
  state?: string | null;
  city?: string | null;
  phone: string;
  status: CompanyStatus;
}

export interface FleetRider {
  id: string;
  phone: string;
  vehicleType?: string | null;
  plateNumber?: string | null;
  status: RiderStatus;
  user: { name: string; email: string };
  activeOrders: number;
}

export interface FleetInvite {
  id: string;
  email: string;
  expiresAt: string;
}

export interface FleetDelivery {
  id: string;
  status: OrderStatus;
  cylinderSize: string;
  quantity: number;
  deliveryAddress: string;
  assignedAt?: string | null;
  createdAt: string;
  consumer: { name: string };
  vendor?: { businessName: string } | null;
  rider?: { id: string; user: { name: string } } | null;
}

export interface VendorOrder {
  id: string;
  /** The branch fulfilling the order; null for orders that predate branches. */
  branchId?: string | null;
  consumer: { id: string; name: string; email: string };
  listing: GasListing;
  assignedAt?: string | null;
  rider?: { id: string; phone: string; user: { name: string } } | null;
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
      body: JSON.stringify({ name, email, password, role, acceptedTerms: true, legalVersion: LEGAL_VERSION }),
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
    // While the session still exists: stop pushing to this phone for the account leaving it.
    // Imported here because lib/push.ts itself uses this file.
    await import('./push').then((m) => m.unregisterPush()).catch(() => {});
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

  /** Re-fetches the user and persists it, so role-status changes (e.g. rider approval) reach routing. */
  async refreshUser(): Promise<ApiUser> {
    const user = await authApi.me();
    const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
    if (accessToken && refreshToken) await saveSession(accessToken, refreshToken, user);
    return user;
  },

  async updateProfile(patch: Partial<{
    name: string;
    phone: string | null;
    avatarUrl: string | null;
    pushEnabled: boolean;
    emailNotifEnabled: boolean;
    smsAlertsEnabled: boolean;
    unitPreference: UnitPreference;
  }>): Promise<ApiUser> {
    const data = await request<{ user: ApiUser }>('/api/auth/me', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(patch),
    });
    const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
    if (accessToken && refreshToken) await saveSession(accessToken, refreshToken, data.user);
    return data.user;
  },

  /**
   * Self-service erasure for every account type. The backend answers 409 while
   * orders or deliveries are in flight (and `CONTACT_SUPPORT` for vendors with
   * unpaid earnings). On success the account is anonymised, so the local session goes too.
   */
  async deleteAccount(password: string): Promise<void> {
    await request('/api/auth/me', {
      method: 'DELETE',
      auth: true,
      body: JSON.stringify({ password }),
    });
    await clearSession();
  },
};

// ── Vendor API ────────────────────────────────────────────────────────────────

export type VendorEarningStatus = 'AVAILABLE' | 'IN_PAYOUT' | 'PAID' | 'SETTLED';

export interface VendorEarningRow {
  id: string;
  orderId: string;
  grossAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  netAmount: number;
  status: VendorEarningStatus;
  createdAt: string;
  order: { cylinderSize: string; quantity: number };
}

export interface VendorEarningsResponse {
  totals: { settled: number; paidOut: number; awaitingPayout: number; commission: number; orders: number };
  payoutAccount: { bankName: string; accountName: string; last4: string } | null;
  earnings: VendorEarningRow[];
}

export const vendorApi = {
  /** What delivered orders paid the vendor after commission, and how each reaches them. */
  async earnings(): Promise<VendorEarningsResponse> {
    return request<VendorEarningsResponse>('/api/vendor/earnings', { auth: true });
  },

  async createProfile(data: {
    businessName: string;
    businessAddress: string;
    phone: string;
    rcNumber: string;
    lat?: number;
    lng?: number;
    /** Extra branches besides the main one, which is seeded from the business address. */
    branches?: BranchInput[];
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

  async updateProfile(data: Partial<{
    businessName: string;
    businessAddress: string;
    phone: string;
    rcNumber: string;
    bio: string | null;
    /** Key from `vendorApi.uploadImage('logo', …)`; null removes the logo. */
    logoKey: string | null;
    lat: number;
    lng: number;
  }>): Promise<VendorProfile> {
    const res = await request<{ profile: VendorProfile }>('/api/vendor/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  /** Applies immediately and starts a cooldown; 409 `PLAN_LOCKED` while one is running. */
  async changePlan(plan: VendorPlan): Promise<VendorProfile> {
    const res = await request<{ profile: VendorProfile }>('/api/vendor/plan', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ plan }),
    });
    return res.profile;
  },

  /**
   * Uploads a logo or listing photo to the public image bucket and returns the
   * key to save (`logoKey` / `imageKey`) plus a URL to preview it with. Same steps
   * as documents: ask for a link, PUT the bytes to R2, then the caller saves the
   * key — the server checks that it exists and belongs to this vendor.
   */
  async uploadImage(
    kind: 'logo' | 'listing',
    file: { uri: string; mimeType?: string | null },
  ): Promise<{ key: string; publicUrl: string | null }> {
    const blob = await (await fetch(file.uri)).blob();
    const contentType = blob.type || file.mimeType || 'image/jpeg';

    const { key, uploadUrl, publicUrl } = await request<{ key: string; uploadUrl: string; publicUrl: string | null }>(
      '/api/vendor/images/upload-url',
      { method: 'POST', auth: true, body: JSON.stringify({ kind, contentType, size: blob.size }) },
    );

    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!put.ok) throw new Error('Image upload failed. Please try again.');
    return { key, publicUrl };
  },

  async getListings(branchId?: string): Promise<GasListing[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const res = await request<{ listings: GasListing[] }>(`/api/vendor/listings${qs}`, { auth: true });
    return res.listings;
  },

  async getBranchStaff(branchId: string): Promise<StaffMember[]> {
    const res = await request<{ staff: StaffMember[] }>(`/api/vendor/branches/${branchId}/staff`, { auth: true });
    return res.staff;
  },

  /** `emailSent` is false when the invite was saved but the email could not be delivered. */
  async inviteStaff(branchId: string, email: string): Promise<{ emailSent: boolean }> {
    return request(`/api/vendor/branches/${branchId}/staff`, {
      method: 'POST', auth: true, body: JSON.stringify({ email }),
    });
  },

  async revokeStaff(branchId: string, staffId: string): Promise<void> {
    await request(`/api/vendor/branches/${branchId}/staff/${staffId}`, { method: 'DELETE', auth: true });
  },

  async getBranches(): Promise<{ branches: Branch[]; maxBranches: number }> {
    return request('/api/vendor/branches', { auth: true });
  },

  async createBranch(data: BranchInput): Promise<Branch> {
    const res = await request<{ branch: Branch }>('/api/vendor/branches', {
      method: 'POST', auth: true, body: JSON.stringify(data),
    });
    return res.branch;
  },

  async updateBranch(id: string, data: Partial<BranchInput>): Promise<Branch> {
    const res = await request<{ branch: Branch }>(`/api/vendor/branches/${id}`, {
      method: 'PATCH', auth: true, body: JSON.stringify(data),
    });
    return res.branch;
  },

  async branchAction(id: string, action: 'make-main' | 'deactivate' | 'reactivate'): Promise<Branch> {
    const res = await request<{ branch: Branch }>(`/api/vendor/branches/${id}/${action}`, {
      method: 'POST', auth: true,
    });
    return res.branch;
  },

  async createListing(data: {
    branchId?: string;
    gasType: GasType;
    customName?: string;
    pricePerKg: number;
    cylinderSizes: string[];
    otherSizes?: string;
    inStock?: boolean;
    /** Key from `vendorApi.uploadImage('listing', …)`. */
    imageKey?: string | null;
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
    /** Key from `vendorApi.uploadImage('listing', …)`; null removes the photo. */
    imageKey: string | null;
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

  async getRiders(): Promise<AssignableRider[]> {
    const res = await request<{ riders: AssignableRider[] }>('/api/vendor/riders', { auth: true });
    return res.riders;
  },

  /** Assign a rider to one of this vendor's orders; `null` unassigns. Never touches status. */
  async assignRider(orderId: string, riderId: string | null): Promise<void> {
    await request(`/api/vendor/orders/${orderId}/rider`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ riderId }),
    });
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

// ── Rider API ─────────────────────────────────────────────────────────────────

export interface RiderProfile {
  id: string;
  phone: string;
  vehicleType?: string | null;
  plateNumber?: string | null;
  status: RiderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RiderOrder {
  id: string;
  status: OrderStatus;
  supplierName?: string | null;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  assignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  consumer: { id: string; name: string; email: string; phone?: string | null };
  vendor?: { id: string; businessName: string; businessAddress?: string | null; phone: string } | null;
}

// ── Payout account (vendors and riders) ─────────────────────────────────────

export interface BankOption {
  name: string;
  code: string;
}

/** The saved payout account. The full number is never returned. */
export interface PayoutAccount {
  bankName: string;
  accountName: string;
  last4: string;
  updatedAt: string;
}

export const bankApi = {
  async banks(): Promise<BankOption[]> {
    const data = await request<{ banks: BankOption[] }>('/api/bank/banks', { auth: true });
    return data.banks;
  },

  async getAccount(): Promise<PayoutAccount | null> {
    const data = await request<{ account: PayoutAccount | null }>('/api/bank/account', { auth: true });
    return data.account;
  },

  /** The account name is resolved by the bank; the password confirms it is really the owner. */
  async saveAccount(payload: { bankCode: string; accountNumber: string; password: string }): Promise<PayoutAccount> {
    const data = await request<{ account: PayoutAccount }>('/api/bank/account', {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(payload),
    });
    return data.account;
  },
};

export interface RiderEarningRow {
  id: string;
  orderId: string;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface RiderEarningsResponse {
  earnings: RiderEarningRow[];
  totals: { paid: number; pending: number };
}

export const riderApi = {
  /** The rider's share of each delivered order's delivery fee. */
  async earnings(): Promise<RiderEarningsResponse> {
    return request<RiderEarningsResponse>('/api/rider/earnings', { auth: true });
  },

  async createProfile(data: { phone: string; vehicleType?: string; plateNumber?: string }): Promise<RiderProfile> {
    const res = await request<{ profile: RiderProfile }>('/api/rider/profile', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  async getProfile(): Promise<RiderProfile> {
    const res = await request<{ profile: RiderProfile }>('/api/rider/me', { auth: true });
    return res.profile;
  },

  async updateProfile(data: Partial<{ phone: string; vehicleType: string; plateNumber: string }>): Promise<RiderProfile> {
    const res = await request<{ profile: RiderProfile }>('/api/rider/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    });
    return res.profile;
  },

  async getOrders(): Promise<RiderOrder[]> {
    const res = await request<{ orders: RiderOrder[] }>('/api/rider/orders', { auth: true });
    return res.orders;
  },

  async updateOrderStatus(id: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED'): Promise<void> {
    await request(`/api/rider/orders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ status }),
    });
  },
};

// ── Orders API ────────────────────────────────────────────────────────────────

/** An order as the consumer's own list/detail endpoints return it. */
export interface ConsumerOrder {
  id: string;
  supplierName?: string | null;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: OrderStatus;
  paystackRef?: string | null;
  createdAt: string;
  updatedAt: string;
  vendor?: { businessName: string; businessAddress: string } | null;
  rider?: { phone: string; user: { name: string } } | null;
}

export interface InitializeOrderPayload {
  /** Marketplace listing being bought. The server prices the order from it. */
  listingId: string;
  cylinderSize: string;
  quantity: number;
  deliveryAddress: string;
  /** With cylinderSize "Loose" (and quantity 1): exactly one of these. */
  looseKg?: number;
  looseAmount?: number;
  /** The gateway the customer chose from `ordersApi.paymentProviders()`; omitted = the server default. */
  paymentProvider?: string;
}

export interface PaymentProviderOption {
  id: string;
  label: string;
}

export interface MarketplaceListing {
  id: string;
  gasType: 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';
  customName: string | null;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes: string | null;
  /** Vendor can fill any quantity, so customers may order by kg or by amount. */
  sellsLoose: boolean;
  inStock: boolean;
  imageUrl: string | null;
  vendor: {
    id: string;
    logoUrl: string | null;
    businessName: string;
    businessAddress: string;
    state: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
  };
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** Messages from the 4FG team, and this phone's push token. */
export const notificationsApi = {
  async list(): Promise<{ notifications: AppNotification[]; unread: number }> {
    return request('/api/notifications', { auth: true });
  },
  async unreadCount(): Promise<number> {
    const data = await request<{ unread: number }>('/api/notifications/unread-count', { auth: true });
    return data.unread;
  },
  async markRead(id: string): Promise<void> {
    await request(`/api/notifications/${id}/read`, { method: 'POST', auth: true });
  },
  async markAllRead(): Promise<void> {
    await request('/api/notifications/read-all', { method: 'POST', auth: true });
  },
  async registerPushToken(token: string, platform: 'android' | 'ios'): Promise<void> {
    await request('/api/notifications/push-token', { method: 'PUT', auth: true, body: JSON.stringify({ token, platform }) });
  },
  async removePushToken(token: string): Promise<void> {
    await request('/api/notifications/push-token', { method: 'DELETE', auth: true, body: JSON.stringify({ token }) });
  },
};

export const marketplaceApi = {
  async listings(): Promise<{ listings: MarketplaceListing[] }> {
    return request('/api/marketplace/listings');
  },
};

export interface InitializeOrderResult {
  orderId: string;
  reference: string;
  authorizationUrl: string;
  amount: number;
  email: string;
}

export const ordersApi = {
  /** Gateways enabled for checkout. Show a picker only when there is more than one. */
  async paymentProviders(): Promise<{ default: string; providers: PaymentProviderOption[] }> {
    return request('/api/orders/payment-providers');
  },

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

  async list(): Promise<ConsumerOrder[]> {
    const data = await request<{ orders: ConsumerOrder[] }>('/api/orders', { auth: true });
    return data.orders;
  },

  async get(id: string): Promise<ConsumerOrder> {
    const data = await request<{ order: ConsumerOrder }>(`/api/orders/${id}`, { auth: true });
    return data.order;
  },
};

// ── Saved addresses API ───────────────────────────────────────────────────────

export interface SavedAddress {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const addressApi = {
  async list(): Promise<SavedAddress[]> {
    const data = await request<{ addresses: SavedAddress[] }>('/api/addresses', { auth: true });
    return data.addresses;
  },

  async create(payload: { label: string; fullAddress: string; isDefault?: boolean }): Promise<SavedAddress> {
    const data = await request<{ address: SavedAddress }>('/api/addresses', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
    return data.address;
  },

  async update(
    id: string,
    payload: Partial<{ label: string; fullAddress: string; isDefault: boolean }>,
  ): Promise<SavedAddress> {
    const data = await request<{ address: SavedAddress }>(`/api/addresses/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    });
    return data.address;
  },

  async remove(id: string): Promise<void> {
    await request(`/api/addresses/${id}`, { method: 'DELETE', auth: true });
  },
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


// ── Sensor API ────────────────────────────────────────────────────────────────

export interface SensorReading {
  weight: number;
  temperature?: number;
  pressure?: number;
  timestamp: string;
  status: 'success' | 'timeout' | 'error';
  rawResponse?: string;
}

export interface DeviceCommandResult {
  success: boolean;
  message: string;
  rawResponse?: string;
  data?: Record<string, any>;
}

export interface DeviceConfig {
  phoneNumber?: string;
  location?: string;
  minimumLevel?: number;
  currentPassword?: string;
}

export const sensorApi = {
  /**
   * Get current weight sensor reading from device
   * Sends USSD: *1234*INFO#
   * Returns weight in kg, temperature, pressure, etc.
   */
  async getReading(): Promise<SensorReading> {
    return request<SensorReading>('/api/device/sensor/reading', {
      auth: true,
    });
  },

  /**
   * Calibrate (tare) the weight scale to zero
   * Sends USSD: *1234*TARE#
   */
  async tare(): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/sensor/tare', {
      method: 'POST',
      auth: true,
    });
  },

  /**
   * Set critical low-level threshold for alerts
   * Sends USSD: *1234*MINIMUM*{level}#
   * @param level Critical level in kg (1-9, integers only, no decimals)
   */
  async setMinimumLevel(level: number): Promise<DeviceCommandResult> {
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      throw new ApiRequestError(
        'Minimum level must be an integer between 1 and 9 kg',
        'INVALID_MINIMUM_LEVEL'
      );
    }

    return request<DeviceCommandResult>('/api/device/sensor/minimum-level', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ level }),
    });
  },

  /**
   * Query device configuration and status
   * Sends USSD: *1234*INFO#
   */
  async queryDeviceInfo(): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/info', {
      auth: true,
    });
  },
};

// ── Device Configuration API ──────────────────────────────────────────────────

export const deviceApi = {
  /**
   * Set device's phone number for notifications
   * Sends USSD: *1234*USER*number*number#
   */
  async setPhoneNumber(phoneNumber: string): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/config/phone', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ phoneNumber }),
    });
  },

  /**
   * Set device's physical location
   * Sends USSD: *1234*ADDRESS*location#
   */
  async setLocation(locationName: string): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/config/location', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ locationName }),
    });
  },

  /**
   * Change device password
   * Sends USSD: *old_password*PASSWORD*new_password#
   * Password must be 1-4 alphanumeric characters
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<DeviceCommandResult> {
    if (newPassword.length > 4 || !/^[a-zA-Z0-9]{1,4}$/.test(newPassword)) {
      throw new ApiRequestError(
        'Password must be 1-4 alphanumeric characters',
        'INVALID_PASSWORD'
      );
    }

    return request<DeviceCommandResult>('/api/device/config/password', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },

  /**
   * Factory reset device (manufacturer only)
   * WARNING: Clears all logs and resets to default password
   */
  async factoryReset(): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/factory-reset', {
      method: 'POST',
      auth: true,
    });
  },

  /**
   * Get device configuration (saved settings)
   */
  async getConfig(): Promise<DeviceConfig> {
    return request<DeviceConfig>('/api/device/config', {
      auth: true,
    });
  },

  /**
   * Save device configuration locally
   */
  async saveConfig(config: DeviceConfig): Promise<DeviceConfig> {
    return request<DeviceConfig>('/api/device/config', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(config),
    });
  },
};

// ── Branch manager API ────────────────────────────────────────────────────────

export const staffApi = {
  async me(): Promise<StaffBranch[]> {
    const res = await request<{ branches: StaffBranch[] }>('/api/staff/me', { auth: true });
    return res.branches;
  },

  async getOrders(branchId?: string): Promise<ManagerOrder[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const res = await request<{ orders: ManagerOrder[] }>(`/api/staff/orders${qs}`, { auth: true });
    return res.orders;
  },

  async updateOrderStatus(id: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED'): Promise<void> {
    await request(`/api/staff/orders/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify({ status }) });
  },

  async getRiders(): Promise<AssignableRider[]> {
    const res = await request<{ riders: AssignableRider[] }>('/api/staff/riders', { auth: true });
    return res.riders;
  },

  async assignRider(orderId: string, riderId: string | null): Promise<void> {
    await request(`/api/staff/orders/${orderId}/rider`, {
      method: 'PATCH', auth: true, body: JSON.stringify({ riderId }),
    });
  },

  async getListings(branchId?: string): Promise<GasListing[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const res = await request<{ listings: GasListing[] }>(`/api/staff/listings${qs}`, { auth: true });
    return res.listings;
  },

  async setStock(id: string, inStock: boolean): Promise<GasListing> {
    const res = await request<{ listing: GasListing }>(`/api/staff/listings/${id}`, {
      method: 'PATCH', auth: true, body: JSON.stringify({ inStock }),
    });
    return res.listing;
  },
};

// ── Logistics company API ─────────────────────────────────────────────────────

export const companyApi = {
  async createProfile(data: {
    companyName: string;
    address: string;
    phone: string;
    state?: string;
    city?: string;
  }): Promise<CompanyProfile> {
    const res = await request<{ company: CompanyProfile }>('/api/company/profile', {
      method: 'POST', auth: true, body: JSON.stringify(data),
    });
    return res.company;
  },

  async getProfile(): Promise<CompanyProfile> {
    const res = await request<{ company: CompanyProfile }>('/api/company/me', { auth: true });
    return res.company;
  },

  async getFleet(): Promise<{ riders: FleetRider[]; invites: FleetInvite[] }> {
    return request('/api/company/riders', { auth: true });
  },

  async inviteRider(email: string): Promise<void> {
    await request('/api/company/riders/invite', { method: 'POST', auth: true, body: JSON.stringify({ email }) });
  },

  async withdrawInvite(id: string): Promise<void> {
    await request(`/api/company/invites/${id}`, { method: 'DELETE', auth: true });
  },

  async removeRider(id: string): Promise<void> {
    await request(`/api/company/riders/${id}`, { method: 'DELETE', auth: true });
  },

  async getDeliveries(): Promise<FleetDelivery[]> {
    const res = await request<{ orders: FleetDelivery[] }>('/api/company/deliveries', { auth: true });
    return res.orders;
  },
};
