import { getAccessToken, getRefreshToken, saveSession, clearSession } from './storage';
import type { VendorPlan } from './plans';
import { LEGAL_VERSION } from './legal';
import type { PublicListing } from './marketplace';

export type { VendorPlan };

// The API lives in the standalone gas-monitor-backend service (Express + Prisma).
// Set NEXT_PUBLIC_API_URL to its origin; defaults to the local dev backend (port 9000).
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9000';

// Utility to build full API URLs
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'CONSUMER' | 'VENDOR' | 'RIDER' | 'BRANCH_MANAGER' | 'LOGISTICS_COMPANY';
export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RiderStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
/**
 * PENDING (unpaid) → CONFIRMED (paid, waiting for the vendor) → ACCEPTED (vendor
 * accepted; in the rider job pool until a rider takes it) → OUT_FOR_DELIVERY →
 * DELIVERED (the rider entered the customer's PIN).
 */
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'ACCEPTED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';

export type UnitPreference = 'KG' | 'LBS';

/** One experience an account holds or could register for. */
export interface RoleInfo {
  role: UserRole;
  /** NOT_REGISTERED = no profile yet; otherwise the profile's approval status. */
  status: 'NOT_REGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE';
  canSwitch: boolean;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  /** The ACTIVE role: what the app is showing right now (and what the next sign-in opens). */
  role: UserRole;
  /** What the account signed up as. */
  primaryRole?: UserRole;
  /** Every role the account holds or could register for. Absent from older API builds. */
  roles?: RoleInfo[];
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

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  /** Key from `authApi.uploadAvatar(file)`, or null to remove the profile picture. */
  avatarKey?: string | null;
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
  /** Only on the customer's own orders: they give it to the rider at the door. */
  deliveryPin?: string | null;
  riderId?: string | null;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
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

// Session handling mirrors the mobile app (gas-monitor/lib/api.ts): one shared
// refresh at a time, a token about to expire is refreshed before the request,
// and only the server refusing the refresh token ends the session (a network
// failure never does). Tabs racing each other are covered by the server keeping
// a just-rotated refresh token valid for a short grace period.

type RefreshOutcome = 'ok' | 'rejected' | 'offline';

let refreshInFlight: Promise<RefreshOutcome> | null = null;
const sessionExpiredHandlers = new Set<() => void>();

/** Called when the server ends the session; the auth context then signs the user out. */
export function onSessionExpired(handler: () => void): () => void {
  sessionExpiredHandlers.add(handler);
  return () => {
    sessionExpiredHandlers.delete(handler);
  };
}

function secondsLeft(token: string): number | null {
  try {
    const part = token.split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? json.exp - Date.now() / 1000 : null;
  } catch {
    return null;
  }
}

async function doRefresh(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return 'rejected';
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
  } catch {
    return 'offline';
  }
  if (res.status === 401 || res.status === 403) {
    // Another tab may have replaced the token while this one was out.
    const current = getRefreshToken();
    return current && current !== refreshToken ? 'ok' : 'rejected';
  }
  if (!res.ok) return 'offline';
  try {
    const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
    const user = getSavedUserSafe();
    if (user) saveSession(tokens.accessToken, tokens.refreshToken, user);
    else {
      window.localStorage.setItem('4fg_access_token', tokens.accessToken);
      window.localStorage.setItem('4fg_refresh_token', tokens.refreshToken);
    }
    return 'ok';
  } catch {
    return 'offline';
  }
}

function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function endSession(): never {
  clearSession();
  sessionExpiredHandlers.forEach((h) => h());
  throw new ApiRequestError('Your session has ended. Please sign in again.', 'SESSION_EXPIRED');
}

const OFFLINE_MESSAGE = "Couldn't reach 4FG. Check your connection and try again.";

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean; _retry?: boolean } = {}
): Promise<T> {
  const { auth = false, _retry = false, headers = {}, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>)
  };

  let sentToken: string | null = null;
  if (auth) {
    sentToken = getAccessToken();
    const left = sentToken ? secondsLeft(sentToken) : null;
    if (sentToken && left !== null && left < 30 && getRefreshToken()) {
      const outcome = await refreshSession();
      if (outcome === 'rejected') endSession();
      if (outcome === 'ok') sentToken = getAccessToken();
    }
    if (sentToken) reqHeaders['Authorization'] = `Bearer ${sentToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers: reqHeaders, ...rest });
  } catch {
    throw new ApiRequestError(OFFLINE_MESSAGE, 'NETWORK');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && auth && !_retry && getRefreshToken()) {
      const current = getAccessToken();
      if (current && current !== sentToken) return request<T>(path, { ...options, _retry: true });
      const outcome = await refreshSession();
      if (outcome === 'ok') return request<T>(path, { ...options, _retry: true });
      if (outcome === 'rejected') endSession();
      throw new ApiRequestError(OFFLINE_MESSAGE, 'NETWORK');
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
      // Callers must have collected explicit consent (sign-up gates on LegalConsent).
      body: JSON.stringify({ name, email, password, role, acceptedTerms: true, legalVersion: LEGAL_VERSION })
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

  /** Look up an invitation from its emailed one-time token. Public. */
  async peekInvite(token: string): Promise<InviteInfo> {
    const data = await request<{ invite: InviteInfo }>(`/api/staff/invite/${encodeURIComponent(token)}`);
    return data.invite;
  },

  /**
   * Accept a branch-manager invitation. A new manager gets an account and is signed
   * in; an existing manager just has the branch added (they sign in as usual).
   */
  async acceptInvite(token: string, input: { name: string; password: string }): Promise<AcceptInviteResult> {
    const data = await request<
      | { status: 'CREATED'; user: ApiUser; accessToken: string; refreshToken: string }
      | { status: 'LINKED'; branchName: string }
    >(`/api/staff/invite/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ ...input, acceptedTerms: true, legalVersion: LEGAL_VERSION })
    });
    if (data.status === 'CREATED') {
      saveSession(data.accessToken, data.refreshToken, data.user);
      return { status: 'CREATED', user: data.user };
    }
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

  /** Switch the experience the app opens. Nothing is granted: every route still checks the profile. */
  async switchRole(role: UserRole): Promise<ApiUser> {
    const data = await request<{ user: ApiUser }>('/api/auth/switch-role', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ role })
    });
    return data.user;
  },

  /**
   * Self-service erasure for every account type. The backend refuses (409) while
   * orders or deliveries are in flight, and for vendors with unpaid earnings
   * (`CONTACT_SUPPORT`); its message is meant to be shown as-is.
   */
  async deleteAccount(password: string): Promise<void> {
    await request('/api/auth/me', { method: 'DELETE', auth: true, body: JSON.stringify({ password }) });
    clearSession();
  },

  /** Uploads a profile picture (any account type); save the key with `updateProfile({ avatarKey })`. */
  async uploadAvatar(file: File): Promise<{ key: string; publicUrl: string | null }> {
    const { key, uploadUrl, publicUrl } = await request<{ key: string; uploadUrl: string; publicUrl: string | null }>(
      '/api/auth/me/avatar/upload-url',
      { method: 'POST', auth: true, body: JSON.stringify({ contentType: file.type, size: file.size }) }
    );
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Photo upload failed. Please try again.');
    return { key, publicUrl };
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

/**
 * The backend prices `listingId` (an approved vendor's listing) and `product`
 * (sold by 4First) orders itself. `supplierName` + `totalAmount` are only for
 * legacy orders that name neither.
 */
export interface InitializeOrderPayload {
  listingId?: string;
  product?: 'MONITOR';
  supplierName?: string;
  totalAmount?: number;
  cylinderSize: string;
  quantity: number;
  deliveryAddress: string;
  /** With cylinderSize "Loose" (and quantity 1): exactly one of these. */
  looseKg?: number;
  looseAmount?: number;
  /** The gateway the customer chose from `ordersApi.paymentProviders()`; omitted = the server default. */
  paymentProvider?: string;
}

export interface InitializeOrderResult {
  orderId: string;
  reference: string;
  authorizationUrl: string;
  amount: number;
  email: string;
}

export interface PaymentProviderOption {
  id: string;
  label: string;
}

/** The delivery PIN comes back with the payment check: guests have no account to read it from. */
export interface PaymentVerifyResult {
  success: boolean;
  orderId: string;
  status: string;
  deliveryPin?: string | null;
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
      body: JSON.stringify(payload)
    });
  },

  async verify(reference: string): Promise<PaymentVerifyResult> {
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

  async guestVerify(reference: string): Promise<PaymentVerifyResult> {
    return request('/api/orders/guest/verify', {
      method: 'POST',
      body: JSON.stringify({ reference })
    });
  }
};

// ── Vendor API ────────────────────────────────────────────────────────────────

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

/** What the accept-invite page shows before the manager commits. */
export interface InviteInfo {
  email: string;
  branchName: string;
  businessName: string;
  accountExists: boolean;
  /** They already have a manager account, so the branch can simply be added to it. */
  canLink: boolean;
}

export type AcceptInviteResult = { status: 'CREATED'; user: ApiUser } | { status: 'LINKED'; branchName: string };

export interface StaffMember {
  id: string;
  email: string;
  status: 'INVITED' | 'ACTIVE';
  expiresAt: string;
  user?: { name: string } | null;
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
  sellsLoose?: boolean;
  inStock: boolean;
  /** Product photo as a public URL (null/absent = none). Set through `imageKey` on create/update. */
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPlanChange {
  id: string;
  fromPlan: VendorPlan;
  toPlan: VendorPlan;
  actor: 'VENDOR' | 'ADMIN';
  actorName?: string | null;
  bypassedCooldown: boolean;
  createdAt: string;
}

export interface VendorProfile {
  id: string;
  businessName: string;
  businessAddress: string;
  state?: string | null;
  city?: string | null;
  bio?: string | null;
  logoUrl?: string | null;
  lat?: number;
  lng?: number;
  phone: string;
  /** CAC registration number ("RC1234567"); admins need it to approve the vendor. */
  rcNumber?: string | null;
  status: VendorStatus;
  plan: VendorPlan;
  planChangedAt?: string | null;
  planLockedUntil?: string | null;
  listings?: GasListing[];
  branches?: Branch[];
  /** Newest first, capped server-side. */
  planChanges?: VendorPlanChange[];
}

export interface UpdateVendorProfilePayload {
  businessName?: string;
  businessAddress?: string;
  state?: string;
  city?: string;
  phone?: string;
  rcNumber?: string;
  bio?: string | null;
  /** Key from `vendorApi.uploadImage('logo', file)`; null removes the logo. */
  logoKey?: string | null;
  lat?: number;
  lng?: number;
}

export interface VendorOrder extends Order {
  /** The branch fulfilling the order; null for orders that predate branches. */
  branchId?: string | null;
  consumer: { id: string; name: string; email: string };
  listing?: GasListing;
  assignedAt?: string | null;
  rider?: { id: string; phone: string; user: { name: string } } | null;
}

export interface CreateVendorProfilePayload {
  businessName: string;
  businessAddress: string;
  state: string;
  city: string;
  phone: string;
  rcNumber: string;
  plan: VendorPlan;
  lat?: number;
  lng?: number;
  /** Extra branches besides the main one, which is seeded from the business address. */
  branches?: BranchInput[];
}

export interface ListingPayload {
  /** Omitted means the main branch. */
  branchId?: string;
  gasType: GasType;
  customName?: string;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes?: string;
  sellsLoose?: boolean;
  inStock?: boolean;
  /** Key from `vendorApi.uploadImage('listing', file)`; null removes the photo. */
  imageKey?: string | null;
}

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

  /**
   * Switch partner plan. Applies immediately and starts a cooldown — the
   * backend answers 409 `PLAN_LOCKED` if one is still running.
   */
  async changePlan(plan: VendorPlan): Promise<VendorProfile> {
    const data = await request<{ profile: VendorProfile }>('/api/vendor/plan', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ plan })
    });
    return data.profile;
  },

  /**
   * Uploads a business logo or listing photo to the public image bucket. Returns
   * the key to save (`logoKey` / `imageKey`) and a URL to preview it with.
   * The browser PUTs straight to R2, so the bucket needs a CORS rule for this origin.
   */
  async uploadImage(kind: 'logo' | 'listing', file: File): Promise<{ key: string; publicUrl: string | null }> {
    const { key, uploadUrl, publicUrl } = await request<{ key: string; uploadUrl: string; publicUrl: string | null }>(
      '/api/vendor/images/upload-url',
      { method: 'POST', auth: true, body: JSON.stringify({ kind, contentType: file.type, size: file.size }) }
    );
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Image upload failed. Please try again.');
    return { key, publicUrl };
  },

  async getListings(branchId?: string): Promise<GasListing[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const data = await request<{ listings: GasListing[] }>(`/api/vendor/listings${qs}`, { auth: true });
    return data.listings;
  },

  async getBranches(): Promise<{ branches: Branch[]; maxBranches: number }> {
    return request('/api/vendor/branches', { auth: true });
  },

  async createBranch(payload: BranchInput): Promise<Branch> {
    const data = await request<{ branch: Branch }>('/api/vendor/branches', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.branch;
  },

  async updateBranch(id: string, payload: Partial<BranchInput>): Promise<Branch> {
    const data = await request<{ branch: Branch }>(`/api/vendor/branches/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.branch;
  },

  async branchAction(id: string, action: 'make-main' | 'deactivate' | 'reactivate'): Promise<Branch> {
    const data = await request<{ branch: Branch }>(`/api/vendor/branches/${id}/${action}`, {
      method: 'POST',
      auth: true
    });
    return data.branch;
  },

  async getBranchStaff(branchId: string): Promise<StaffMember[]> {
    const data = await request<{ staff: StaffMember[] }>(`/api/vendor/branches/${branchId}/staff`, { auth: true });
    return data.staff;
  },

  /** `emailSent` is false when the invite was saved but the email could not be delivered. */
  async inviteStaff(branchId: string, email: string): Promise<{ emailSent: boolean }> {
    return request(`/api/vendor/branches/${branchId}/staff`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ email })
    });
  },

  async revokeStaff(branchId: string, staffId: string): Promise<void> {
    await request(`/api/vendor/branches/${branchId}/staff/${staffId}`, { method: 'DELETE', auth: true });
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

  /** Accept a paid order: it goes to riders, who choose their own jobs. */
  async acceptOrder(id: string): Promise<void> {
    await request(`/api/vendor/orders/${id}/accept`, { method: 'POST', auth: true });
  },

  /** Reject a paid order before pickup. It is cancelled and 4FG refunds the customer. */
  async rejectOrder(id: string, reason?: string): Promise<void> {
    await request(`/api/vendor/orders/${id}/reject`, { method: 'POST', auth: true, body: JSON.stringify({ reason }) });
  }
};

// ── Rider API ─────────────────────────────────────────────────────────────────

export interface RiderProfile {
  id: string;
  phone: string;
  vehicleType?: string | null;
  plateNumber?: string | null;
  status: RiderStatus;
  isOnline?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRiderProfilePayload {
  phone: string;
  vehicleType?: string;
  plateNumber?: string;
}

export interface RiderOrder extends Order {
  assignedAt?: string | null;
  consumer: { id: string; name: string; email: string; phone?: string | null };
  vendor?: { id: string; businessName: string; businessAddress?: string | null; phone: string } | null;
  /** Where to collect the order. */
  branch?: { id: string; name: string; address: string; phone: string; lat: number | null; lng: number | null } | null;
}

// ── Payout account (vendors and riders) ──────────────────────────────────────

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
      body: JSON.stringify(payload)
    });
    return data.account;
  }
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

  async createProfile(payload: CreateRiderProfilePayload): Promise<RiderProfile> {
    const data = await request<{ profile: RiderProfile }>('/api/rider/profile', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async getProfile(): Promise<RiderProfile> {
    const data = await request<{ profile: RiderProfile }>('/api/rider/me', { auth: true });
    return data.profile;
  },

  async updateProfile(payload: Partial<CreateRiderProfilePayload>): Promise<RiderProfile> {
    const data = await request<{ profile: RiderProfile }>('/api/rider/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.profile;
  },

  async getOrders(): Promise<RiderOrder[]> {
    const data = await request<{ orders: RiderOrder[] }>('/api/rider/orders', { auth: true });
    return data.orders;
  },

  /** DELIVERED needs the 4-digit PIN the customer gives the rider. */
  async updateOrderStatus(id: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED', pin?: string): Promise<void> {
    await request(`/api/rider/orders/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ status, pin })
    });
  },

  /** Online riders see the job pool and get job alerts. */
  async setOnline(online: boolean, coords?: { lat: number; lng: number }): Promise<{ isOnline: boolean }> {
    return request('/api/rider/online', { method: 'PATCH', auth: true, body: JSON.stringify({ online, ...coords }) });
  },

  async updateLocation(coords: { lat: number; lng: number }): Promise<void> {
    await request('/api/rider/location', { method: 'PATCH', auth: true, body: JSON.stringify(coords) });
  },

  async getJobs(): Promise<RiderJobsResponse> {
    return request<RiderJobsResponse>('/api/rider/jobs', { auth: true });
  },

  /** Take a job from the pool. 409 JOB_TAKEN if another rider got there first. */
  async acceptJob(id: string): Promise<void> {
    await request(`/api/rider/jobs/${id}/accept`, { method: 'POST', auth: true });
  },

  /** Give a job back before pickup. */
  async releaseJob(id: string): Promise<void> {
    await request(`/api/rider/jobs/${id}/release`, { method: 'POST', auth: true });
  }
};

/** One job in the pool. Customer details are only shown once the rider takes it. */
export interface RiderJob {
  id: string;
  ref: string;
  vendorName: string;
  branchName: string | null;
  pickupAddress: string;
  pickupCity: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryAddress: string;
  cylinderSize: string;
  quantity: number;
  riderPay: number;
  distanceKm: number | null;
  waitingSince: string;
}

export interface RiderJobsResponse {
  online: boolean;
  approved: boolean;
  activeJob: { id: string; status: OrderStatus } | null;
  jobs: RiderJob[];
}

// ── Branch manager API ────────────────────────────────────────────────────────

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

/** Order as a branch manager sees it: customer name and phone, never email. */
export interface ManagerOrder extends Order {
  consumer: { id: string; name: string; phone?: string | null };
  listing: { id: string; gasType: GasType; customName?: string | null } | null;
  branch: { id: string; name: string } | null;
  assignedAt?: string | null;
  rider?: { id: string; phone: string; user: { name: string } } | null;
}

export const staffApi = {
  async me(): Promise<StaffBranch[]> {
    const data = await request<{ branches: StaffBranch[] }>('/api/staff/me', { auth: true });
    return data.branches;
  },

  async getOrders(branchId?: string): Promise<ManagerOrder[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const data = await request<{ orders: ManagerOrder[] }>(`/api/staff/orders${qs}`, { auth: true });
    return data.orders;
  },

  async acceptOrder(id: string): Promise<void> {
    await request(`/api/staff/orders/${id}/accept`, { method: 'POST', auth: true });
  },

  async rejectOrder(id: string, reason?: string): Promise<void> {
    await request(`/api/staff/orders/${id}/reject`, { method: 'POST', auth: true, body: JSON.stringify({ reason }) });
  },

  async getListings(branchId?: string): Promise<GasListing[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const data = await request<{ listings: GasListing[] }>(`/api/staff/listings${qs}`, { auth: true });
    return data.listings;
  },

  async setStock(id: string, inStock: boolean): Promise<GasListing> {
    const data = await request<{ listing: GasListing }>(`/api/staff/listings/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ inStock })
    });
    return data.listing;
  }
};

// ── Logistics company API ─────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string;
  companyName: string;
  address: string;
  state?: string | null;
  city?: string | null;
  phone: string;
  status: CompanyStatus;
  createdAt: string;
}

export interface CreateCompanyProfilePayload {
  companyName: string;
  address: string;
  phone: string;
  state?: string;
  city?: string;
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

export const companyApi = {
  async createProfile(payload: CreateCompanyProfilePayload): Promise<CompanyProfile> {
    const data = await request<{ company: CompanyProfile }>('/api/company/profile', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload)
    });
    return data.company;
  },

  async getProfile(): Promise<CompanyProfile> {
    const data = await request<{ company: CompanyProfile }>('/api/company/me', { auth: true });
    return data.company;
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
    const data = await request<{ orders: FleetDelivery[] }>('/api/company/deliveries', { auth: true });
    return data.orders;
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

// ── Saved listings API ────────────────────────────────────────────────────────

/** A saved marketplace listing, in the public marketplace shape plus when it was saved. */
export type SavedListingRow = PublicListing & { savedAt: string };

export const savedApi = {
  /** Ids only, to show "saved" on a listing without loading the whole list. */
  async ids(): Promise<string[]> {
    const data = await request<{ ids: string[] }>('/api/saved/ids', { auth: true });
    return data.ids;
  },

  /** Newest first. Listings that have left the marketplace are left out until they are back. */
  async list(): Promise<SavedListingRow[]> {
    const data = await request<{ listings: SavedListingRow[] }>('/api/saved', { auth: true });
    return data.listings;
  },

  async save(listingId: string): Promise<void> {
    await request(`/api/saved/${encodeURIComponent(listingId)}`, { method: 'PUT', auth: true });
  },

  async remove(listingId: string): Promise<void> {
    await request(`/api/saved/${encodeURIComponent(listingId)}`, { method: 'DELETE', auth: true });
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

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** Where clicking it leads: REFILL or MONITOR (the device id is in `refId`). Null for plain messages. */
  /** ORDER = an order update for the signed-in user (refId = order id). */
  kind?: 'REFILL' | 'MONITOR' | 'ORDER' | null;
  refId?: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Messages from the 4FG team (admin broadcasts). */
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
  }
};

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

// ── Device API ────────────────────────────────────────────────────────────────
// Commands are relayed to the sensor as USSD over SMS (Termii). Each one is a
// billable message, and the backend throttles per device (429 when too soon).

export interface SensorReading {
  weight: number;
  temperature?: number;
  pressure?: number;
  timestamp: string;
  status: 'success' | 'timeout' | 'error';
  /** 'mock' until the backend has a Termii key — the numbers are not from a real sensor. */
  mode?: string;
}

export interface DeviceCommandResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface DeviceConfig {
  phoneNumber?: string;
  location?: string;
  minimumLevel?: number;
}

export const deviceApi = {
  async getReading(): Promise<SensorReading> {
    return request<SensorReading>('/api/device/sensor/reading', { auth: true });
  },

  async getConfig(): Promise<DeviceConfig> {
    return request<DeviceConfig>('/api/device/config', { auth: true });
  },

  async tare(): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/sensor/tare', { method: 'POST', auth: true });
  },

  /** Critical level in whole kg, 1–9. */
  async setMinimumLevel(level: number): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/sensor/minimum-level', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ level })
    });
  },

  async setPhoneNumber(phoneNumber: string): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/config/phone', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ phoneNumber })
    });
  },

  async setLocation(locationName: string): Promise<DeviceCommandResult> {
    return request<DeviceCommandResult>('/api/device/config/location', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ locationName })
    });
  }
};

/** One suggested way to refill a monitor's cylinder (`GET /api/devices/:id/reorder`). */
export interface ReorderOption {
  listingId: string;
  vendorName: string;
  branchName: string | null;
  city: string | null;
  cylinderSize: string;
  unitPrice: number;
  total: number;
  previous: boolean;
}

export interface ReorderSuggestion {
  sizeKg: number | null;
  options: ReorderOption[];
  hasOpenOrder: boolean;
  needsCylinder: boolean;
}

export interface Monitor {
  id: string;
  nickname: string | null;
  role: 'OWNER' | 'MEMBER' | 'VIEWER';
  cylinder: { id: string; name: string; sizeKg: number } | null;
  emptyWeightKg: number | null;
  alerts: { lowPercent: number; lowKg: number | null; lowDays: number | null };
  fw: string | null;
  state: {
    online: boolean;
    lastSeenAt: string | null;
    lastReadingAt: string | null;
    readingAgeSec: number | null;
    stale: boolean;
    grossKg: number | null;
    netKg: number | null;
    percent: number | null;
    calibrating: boolean;
    tempC: number | null;
    batteryPct: number | null;
    externalPower: boolean;
    rssi: number | null;
  };
  config: { version: number; applied: number; pending: boolean };
}

export interface MonitorDayPoint {
  day: string;
  startKg: number;
  endKg: number;
  minKg: number;
  maxKg: number;
  /** Gas used that day, in kg. */
  consumedKg: number;
  readings: number;
}

export interface MonitorHourPoint {
  t: string;
  percent: number | null;
  netKg: number | null;
}

export type MonitorCommandStatus = 'QUEUED' | 'SENT' | 'ACKED' | 'FAILED' | 'EXPIRED';
export interface MonitorCommand {
  id: string;
  type: string;
  status: MonitorCommandStatus;
  result: string | null;
  detail: string | null;
}

export interface MonitorSettingsPatch {
  nickname?: string | null;
  cylinderId?: string | null;
  emptyWeightKg?: number | null;
  lowPercent?: number;
  lowKg?: number | null;
  lowDays?: number | null;
}

/** The cloud-connected monitor endpoints (distinct from the older USSD `deviceApi`). */
export const monitorApi = {
  async list(): Promise<{ devices: Monitor[] }> {
    return request('/api/devices', { auth: true });
  },
  async claim(deviceId: string, claimCode: string, nickname?: string): Promise<{ device: Monitor }> {
    return request('/api/devices/claim', { method: 'POST', auth: true, body: JSON.stringify({ deviceId, claimCode, ...(nickname ? { nickname } : {}) }) });
  },
  async get(deviceId: string): Promise<{ device: Monitor }> {
    return request(`/api/devices/${encodeURIComponent(deviceId)}`, { auth: true });
  },
  async hourly(deviceId: string, hours = 24): Promise<{ points: MonitorHourPoint[] }> {
    const from = new Date(Date.now() - hours * 3600_000).toISOString();
    return request(`/api/devices/${encodeURIComponent(deviceId)}/readings?bucket=hour&from=${encodeURIComponent(from)}`, { auth: true });
  },
  /** One point per Lagos day. `day` is the start of that day as a UTC timestamp. */
  async daily(deviceId: string, days = 7): Promise<{ points: MonitorDayPoint[] }> {
    const from = new Date(Date.now() - days * 24 * 3600_000).toISOString();
    return request(`/api/devices/${encodeURIComponent(deviceId)}/readings?bucket=day&from=${encodeURIComponent(from)}`, { auth: true });
  },
  async command(deviceId: string, type: 'REPORT_NOW' | 'TARE' | 'REBOOT', idempotencyKey: string): Promise<{ command: MonitorCommand }> {
    return request(`/api/devices/${encodeURIComponent(deviceId)}/commands`, { method: 'POST', auth: true, headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ type }) });
  },
  async getCommand(deviceId: string, commandId: string): Promise<{ command: MonitorCommand }> {
    return request(`/api/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`, { auth: true });
  },
  async settings(deviceId: string, patch: MonitorSettingsPatch): Promise<{ device: Monitor }> {
    return request(`/api/devices/${encodeURIComponent(deviceId)}/settings`, { method: 'PATCH', auth: true, body: JSON.stringify(patch) });
  },
  async reorder(deviceId: string): Promise<ReorderSuggestion> {
    return request(`/api/devices/${encodeURIComponent(deviceId)}/reorder`, { auth: true });
  }
};
