/**
 * Row shapes returned by the admin API, derived from the Prisma schema and the
 * `select`/`include` clauses in gas-monitor-backend/src/routes/admin/*.
 *
 * Kept in one file so a backend `select` change has a single place to land.
 */

export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';
export type UserRole = 'CONSUMER' | 'VENDOR';
export type AdminRoleValue = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';

export interface VendorRow {
  id: string;
  businessName: string;
  businessAddress: string;
  bio: string | null;
  phone: string;
  status: VendorStatus;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
  documents: { id: string; url: string; fileName: string }[];
  _count: { listings: number; orders: number };
}

export interface OrderRow {
  id: string;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: OrderStatus;
  supplierName: string | null;
  paystackRef: string | null;
  paystackStatus: string | null;
  createdAt: string;
  consumer: { id: string; name: string; email: string };
  vendor: { id: string; businessName: string } | null;
}

export interface ListingRow {
  id: string;
  gasType: GasType;
  customName: string | null;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes: string | null;
  inStock: boolean;
  createdAt: string;
  vendor: { id: string; businessName: string; status: VendorStatus };
  _count: { orders: number };
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  emailVerified: boolean;
  isSuspended: boolean;
  createdAt: string;
  vendorProfile: { id: string; status: VendorStatus; businessName: string } | null;
  _count: { orders: number };
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  isSuspended: boolean;
  createdAt: string;
  orderCount: number;
  addressCount: number;
  totalSpend: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: AdminRoleValue;
  isActive: boolean;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: AdminRoleValue;
  action: string;
  resource: string;
  resourceId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StatsResponse {
  userCount: number;
  vendorPending: number;
  vendorApproved: number;
  vendorRejected: number;
  orderCount: number;
  listingCount: number;
  revenue: number;
  pendingValue: number;
  avgOrderValue: number;
}

export interface AnalyticsResponse {
  totalUsers: number;
  totalVendors: number;
  totalRevenue: number;
  totalOrders: number;
  monthly: { month: string; revenue: number; orders: number }[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  vendorFunnel: { status: VendorStatus; count: number }[];
  topVendors: { id: string; businessName: string; orders: number; revenue: number }[];
}

export interface PlatformSettings {
  id: string;
  maintenanceMode: boolean;
  allowVendorSignups: boolean;
  supportEmail: string | null;
  platformFeePercent: number;
  updatedAt: string;
}

/* ------------------------------------------------------------- security --- */
/*
 * NOTE: none of the shapes below are backed by an endpoint yet. They describe
 * the contract the backend is expected to implement — see the TODO(admin-os)
 * markers in security.tsx and error-logs.tsx, and ADMIN_DASHBOARD_REPORT.md.
 */

export type BlockScope = 'ALL' | 'AUTH' | 'API';

export interface BlockedIpRow {
  id: string;
  ipAddress: string;
  reason: string | null;
  scope: BlockScope;
  active: boolean;
  /** null = permanent */
  expiresAt: string | null;
  hitCount: number;
  createdAt: string;
  createdByName: string | null;
}

export type ErrorCategory = 'USER_ERROR' | 'SERVER_ERROR' | 'ATTACK' | 'SYSTEM_RISK' | 'UNKNOWN';
export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ErrorLogRow {
  id: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  source: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  userId: string | null;
  stack: string | null;
  context: Record<string, unknown> | null;
  resolved: boolean;
  resolvedAt: string | null;
  escalatedAt: string | null;
  occurrences: number;
  createdAt: string;
}
