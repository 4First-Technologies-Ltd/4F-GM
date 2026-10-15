import { z } from 'zod';
import { prisma } from './prisma';

export const branchSchema = z.object({
  name: z.string().trim().min(1, 'Branch name is required').max(80),
  address: z.string().trim().min(1, 'Branch address is required').max(250),
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(1, 'Branch phone is required').max(30),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  openingHours: z.record(z.string(), z.unknown()).optional()
});

export const branchPatchSchema = branchSchema.partial();

/**
 * The branch, only if it belongs to this vendor. Every branch-scoped route goes
 * through here — a branch id from the client is never trusted on its own.
 */
export function findOwnBranch(vendorId: string, branchId: string) {
  return prisma.branch.findFirst({ where: { id: branchId, vendorId } });
}

/** The vendor's main branch, used when a writer does not name one. */
export function findMainBranch(vendorId: string) {
  return prisma.branch.findFirst({ where: { vendorId, isMain: true } });
}

/** A branch customers can see and order from: open, and not suspended by an admin. */
export const SELLABLE_BRANCH = { isActive: true, suspendedAt: null } as const;

export function isSellable(b: { isActive: boolean; suspendedAt: Date | null }): boolean {
  return b.isActive && !b.suspendedAt;
}

/** Statuses that mean an order is still being worked and pins its branch open. */
export const OPEN_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'] as const;
