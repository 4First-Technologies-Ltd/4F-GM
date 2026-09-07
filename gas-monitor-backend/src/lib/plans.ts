import { VendorPlan } from '@prisma/client';

/**
 * Partner plans. The commission rate is the platform's cut of a completed
 * marketplace order, and this file is its source of truth on the server —
 * `PlatformSettings.platformFeePercent` is a global fallback, not a per-vendor
 * rate.
 */
export const PLANS: Record<
  VendorPlan,
  { name: string; commissionPercent: number }
> = {
  BASIC: { name: 'Basic', commissionPercent: 5 },
  GROWTH: { name: 'Growth', commissionPercent: 7 },
  PRO: { name: 'Pro / Premium', commissionPercent: 10 }
};

/**
 * How long a vendor is held on a plan after switching to it. Changing this
 * only affects locks created from here on: existing `planLockedUntil` values
 * are already stamped on the row.
 */
export const PLAN_COOLDOWN_DAYS = 14;

export function cooldownExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + PLAN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/** Whole days left on a lock, rounded up. 0 once the lock has passed. */
export function daysRemaining(lockedUntil: Date, now: Date = new Date()): number {
  const ms = lockedUntil.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isLocked(
  lockedUntil: Date | null | undefined,
  now: Date = new Date()
): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}
