export type VendorPlan = "BASIC" | "GROWTH" | "PRO";

export type PlanInfo = {
  key: VendorPlan;
  /** Plan name as shown to vendors. */
  name: string;
  /** Platform commission on a completed marketplace order. */
  commissionPercent: number;
  tagline: string;
};

/**
 * Partner plans, mirroring `gas-monitor-backend/src/lib/plans.ts`. The backend
 * is the authority — these values exist so the UI can label and price a plan
 * without a round trip, and must be kept in step with it.
 */
export const PLANS: Record<VendorPlan, PlanInfo> = {
  BASIC: {
    key: "BASIC",
    name: "Basic",
    commissionPercent: 5,
    tagline: "Get online and become discoverable.",
  },
  GROWTH: {
    key: "GROWTH",
    name: "Growth",
    commissionPercent: 7,
    tagline: "Reach more customers and grow your sales.",
  },
  PRO: {
    key: "PRO",
    name: "Pro / Premium",
    commissionPercent: 10,
    tagline: "Maximum visibility, data and growth.",
  },
};

export const PLAN_ORDER: VendorPlan[] = ["BASIC", "GROWTH", "PRO"];

export const PLAN_LIST: PlanInfo[] = PLAN_ORDER.map((k) => PLANS[k]);

/** Matches the backend cooldown — shown to vendors before they commit. */
export const PLAN_COOLDOWN_DAYS = 14;

export function planRate(plan: VendorPlan): string {
  return `${PLANS[plan].commissionPercent}%`;
}

export function isVendorPlan(value: unknown): value is VendorPlan {
  return value === "BASIC" || value === "GROWTH" || value === "PRO";
}

/** Whole days left on a plan lock, 0 once it has passed. */
export function daysRemaining(
  lockedUntil: string | Date | null | undefined,
): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
