/**
 * Row shapes returned by the admin API, derived from the Prisma schema and the
 * `select`/`include` clauses in gas-monitor-backend/src/routes/admin/*.
 *
 * Kept in one file so a backend `select` change has a single place to land.
 */

export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type VendorPlan = 'BASIC' | 'GROWTH' | 'PRO';
export type RiderStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type GasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';
export type UserRole = 'CONSUMER' | 'VENDOR' | 'RIDER';
export type AdminRoleValue = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';

export interface VendorRow {
  id: string;
  businessName: string;
  businessAddress: string;
  bio: string | null;
  phone: string;
  status: VendorStatus;
  plan: VendorPlan;
  planChangedAt: string | null;
  planLockedUntil: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
  documents: { id: string; url: string; fileName: string }[];
  /** Newest first, capped server-side. Present on detail reads only. */
  planChanges?: VendorPlanChangeRow[];
  _count: { listings: number; orders: number };
}

export interface VendorPlanChangeRow {
  id: string;
  fromPlan: VendorPlan;
  toPlan: VendorPlan;
  actor: 'VENDOR' | 'ADMIN';
  actorName: string | null;
  actorEmail: string | null;
  bypassedCooldown: boolean;
  createdAt: string;
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
  rider: { id: string; phone: string; user: { name: string } } | null;
}

export interface RiderRow {
  id: string;
  phone: string;
  vehicleType: string | null;
  plateNumber: string | null;
  lat: number | null;
  lng: number | null;
  status: RiderStatus;
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
  /** Present on detail reads only. */
  orders?: {
    id: string;
    status: OrderStatus;
    deliveryAddress: string;
    assignedAt: string | null;
    createdAt: string;
  }[];
  _count: { orders: number };
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
  riderProfile: { id: string; status: RiderStatus } | null;
  _count: { orders: number };
}

/** `GET /api/admin/users/:id` — everything we hold on one account. */
export interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  devicePhone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  isSuspended: boolean;
  pushEnabled: boolean;
  emailNotifEnabled: boolean;
  smsAlertsEnabled: boolean;
  unitPreference: string;
  createdAt: string;
  updatedAt: string;
  totalSpend: number;
  vendorProfile: {
    id: string;
    businessName: string;
    businessAddress: string;
    state: string | null;
    city: string | null;
    phone: string;
    status: VendorStatus;
    bio: string | null;
    logoUrl: string | null;
    lat: number | null;
    lng: number | null;
    plan: VendorPlan;
    planChangedAt: string | null;
    planLockedUntil: string | null;
    createdAt: string;
    documents: { id: string; url: string; fileName: string; createdAt: string }[];
    planChanges: VendorPlanChangeRow[];
    _count: { listings: number; orders: number; documents: number };
  } | null;
  riderProfile: {
    id: string;
    phone: string;
    vehicleType: string | null;
    plateNumber: string | null;
    lat: number | null;
    lng: number | null;
    status: RiderStatus;
    createdAt: string;
    orders: {
      id: string;
      status: OrderStatus;
      deliveryAddress: string;
      assignedAt: string | null;
      createdAt: string;
    }[];
    _count: { orders: number };
  } | null;
  addresses: { id: string; label: string; fullAddress: string; isDefault: boolean }[];
  cylinderProfiles: { id: string; name: string; sizeKg: number; isActive: boolean }[];
  legalAcceptances: {
    id: string;
    document: string;
    version: string;
    ipAddress: string | null;
    acceptedAt: string;
  }[];
  orders: {
    id: string;
    cylinderSize: string;
    quantity: number;
    totalAmount: number;
    status: OrderStatus;
    supplierName: string | null;
    deliveryAddress: string;
    createdAt: string;
  }[];
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
  /** 4FG Monitor terms, whole naira. The backend prices monitor orders from these. */
  monitorUnitPrice: number;
  monitorDeliveryFee: number;
  monitorMinQuantity: number;
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

/* ------------------------------------------------------ payouts & support --- */

export type EarningStatus = 'AVAILABLE' | 'IN_PAYOUT' | 'PAID';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface PayoutSummary {
  available: number;
  availableCount: number;
  inPayout: number;
  paid: number;
  commissionEarned: number;
  grossVolume: number;
  payoutsNeedingAttention: number;
  minimumPayout: number;
}

export interface VendorBalanceRow {
  vendorId: string;
  businessName: string;
  plan: VendorPlan | null;
  vendorStatus: VendorStatus | null;
  bankAccount: { bankName: string; accountNumber: string; accountName: string } | null;
  available: number;
  earningsCount: number;
  payable: boolean;
}

export interface EarningRow {
  id: string;
  orderId: string;
  grossAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  netAmount: number;
  status: EarningStatus;
  payoutId: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string };
}

export interface PayoutRow {
  id: string;
  amount: number;
  status: PayoutStatus;
  reference: string;
  paystackTransferCode: string | null;
  failureReason: string | null;
  bankName: string;
  accountNumber: string;
  accountName: string;
  initiatedByName: string;
  paidAt: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string; phone?: string };
  _count?: { earnings: number };
}

export interface BankOption {
  name: string;
  code: string;
}

export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketCategory = 'ORDER' | 'PAYMENT' | 'DELIVERY' | 'ACCOUNT' | 'VENDOR' | 'DEVICE' | 'OTHER';

export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  channel: 'WEB_FORM' | 'EMAIL' | 'ADMIN';
  requesterName: string;
  requesterEmail: string;
  requesterId: string | null;
  orderId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  firstResponseAt: string | null;
  slaDueAt: string;
  resolvedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  _count?: { messages: number };
}

export interface TicketMessageRow {
  id: string;
  author: 'REQUESTER' | 'ADMIN' | 'SYSTEM';
  authorName: string;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface TicketDetail extends TicketRow {
  messages: TicketMessageRow[];
  requester: { id: string; name: string; role: UserRole; phone: string | null; createdAt: string } | null;
  order: {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    cylinderSize: string;
    quantity: number;
    createdAt: string;
  } | null;
}

export interface SupportSummary {
  open: number;
  pending: number;
  unassigned: number;
  slaBreached: number;
  assignedToMe: number;
}

export interface CannedReplyRow {
  id: string;
  title: string;
  body: string;
}

/* ------------------------------------------------------------------- crm --- */

export type LeadType = 'VENDOR' | 'RIDER';
export type LeadStage = 'NEW' | 'CONTACTED' | 'ONBOARDING' | 'WON' | 'LOST';
export type LeadSource = 'REFERRAL' | 'OUTREACH' | 'WEBSITE' | 'SOCIAL' | 'EVENT' | 'OTHER';
export type LeadActivityType = 'NOTE' | 'CALL' | 'MESSAGE' | 'MEETING' | 'STAGE_CHANGE';

export interface LeadRow {
  id: string;
  name: string;
  type: LeadType;
  stage: LeadStage;
  source: LeadSource;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  city: string | null;
  lostReason: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextFollowUpAt: string | null;
  convertedUserId: string | null;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface LeadActivityRow {
  id: string;
  type: LeadActivityType;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface CrmTaskRow {
  id: string;
  title: string;
  status: 'OPEN' | 'DONE';
  dueAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  leadId: string | null;
  userId: string | null;
  completedAt: string | null;
  createdByName: string;
  createdAt: string;
  lead?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface LeadDetail extends LeadRow {
  activities: LeadActivityRow[];
  tasks: CrmTaskRow[];
}

export interface CrmOverview {
  stages: Partial<Record<LeadStage, number>>;
  overdueTasks: number;
  myOpenTasks: number;
  followUpsDue: number;
  newThisWeek: number;
  wonThisWeek: number;
}

export interface CrmProfile {
  notes: { id: string; body: string; authorName: string; createdAt: string }[];
  tags: { id: string; name: string }[];
  tasks: CrmTaskRow[];
}

/* ------------------------------------------------------------- marketing --- */

export interface SegmentFilter {
  roles: UserRole[];
  vendorStatus?: VendorStatus;
  state?: string;
  hasOrdered?: boolean;
  joinedWithinDays?: number;
  tag?: string;
}

export interface SegmentRow {
  id: string;
  name: string;
  description: string | null;
  filter: SegmentFilter;
  createdByName: string;
  createdAt: string;
  _count?: { campaigns: number };
}

export type CampaignStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'CANCELLED';

export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  segmentId: string | null;
  status: CampaignStatus;
  audienceSize: number;
  sentCount: number;
  failedCount: number;
  createdByName: string;
  startedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  segment?: { id: string; name: string } | null;
  pendingCount?: number;
}

export interface CampaignRecipientRow {
  id: string;
  email: string;
  name: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  error: string | null;
  sentAt: string | null;
}

export interface SuppressionRow {
  email: string;
  reason: string;
  createdAt: string;
}

export interface MarketingOverview {
  campaigns: number;
  sending: number;
  sent30: number;
  failed30: number;
  suppressed: number;
  segments: number;
}

/* --------------------------------------- server logs, usage, briefing --- */

export interface ServerLogRow {
  id: string;
  level: 'WARN' | 'ERROR';
  source: 'console' | 'http';
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  createdAt: string;
}

export interface ServerLogSummary {
  errors24h: number;
  warnings24h: number;
  lastErrorAt: string | null;
  retentionDays: number;
}

export interface UsageOverview {
  days: number;
  totals: { events: number; people: number; users: number; devices: number; sessions: number };
  daily: { day: string; active: number; events: number }[];
  topEvents: { name: string; count: number; actors: number }[];
  topScreens: { screen: string; views: number; actors: number }[];
  platforms: { platform: string; events: number; actors: number }[];
  roles: { role: string; actors: number }[];
  versions: { version: string; actors: number }[];
}

export interface OpsFlag {
  key: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface OpsMetrics {
  day: string;
  generatedAt: string;
  orders: {
    placed: number;
    delivered: number;
    cancelled: number;
    gmv: number;
    avgDeliveryHours: number | null;
    sevenDayAvg: { placed: number; delivered: number; gmv: number };
  };
  live: { awaitingRider: number; oldestAwaitingRiderMin: number | null; stuckOutForDelivery: number; approvedRiders: number };
  growth: {
    signups: { consumers: number; vendors: number; riders: number };
    pendingVendors: number;
    pendingRiders: number;
    oldestPendingDays: number | null;
  };
  support: { opened: number; openNow: number; overdueNow: number };
  money: { owedToVendors: number; paidOut: number; commission: number; payoutsNeedingAttention: number };
  reliability: { serverErrors: number; serverWarnings: number };
  marketing: { campaignsSent: number; emailsSent: number };
  crm: { followUpsOverdue: number; tasksOverdue: number };
}

export interface BriefingDay {
  day: string;
  status: 'ACTION' | 'WATCH' | 'OK';
  sentAt: string | null;
  sendError: string | null;
}

export interface Briefing extends BriefingDay {
  id: string;
  metrics: OpsMetrics;
  flags: OpsFlag[];
  createdAt: string;
  updatedAt: string;
}
