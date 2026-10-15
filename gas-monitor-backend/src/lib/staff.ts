import type { OrderStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { sha256 } from './security';

/** How long an unclaimed invite stays valid. */
export const INVITE_TTL_DAYS = 14;

/** Active managers allowed per branch. */
export const MAX_STAFF_PER_BRANCH = 10;

/** A fresh one-time invite token and the hash that is stored for it. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export const inviteTokenHash = (token: string) => sha256(token);

/** Where the invite email sends the manager: the website's private accept page. */
export function inviteLink(token: string): string {
  const base = (process.env.WEB_APP_URL ?? 'https://4fgmonitor.com').replace(/\/$/, '');
  return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Turn pending invites for this user's verified email into active access.
 * Email verification already proved they own the address, so no token is
 * needed. Expired and revoked invites are left alone.
 */
export async function claimInvites(user: { id: string; email: string; emailVerified: boolean }): Promise<number> {
  if (!user.emailVerified) return 0;
  const res = await prisma.branchStaff.updateMany({
    where: {
      email: { equals: user.email, mode: 'insensitive' },
      status: 'INVITED',
      expiresAt: { gt: new Date() }
    },
    data: { userId: user.id, status: 'ACTIVE', tokenHash: null }
  });
  return res.count;
}

/** Branch ids this manager may act on. Revoked rows never count. */
export async function managedBranchIds(userId: string): Promise<string[]> {
  const rows = await prisma.branchStaff.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { branchId: true }
  });
  return rows.map((r) => r.branchId);
}

/**
 * What a manager may move an order to. Deliberately tighter than the vendor
 * route: PENDING (unpaid) orders are untouchable — payment confirms them — and
 * a delivered or cancelled order is final.
 */
export const MANAGER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  CONFIRMED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED']
};

export function canManagerMove(from: OrderStatus, to: OrderStatus): boolean {
  return (MANAGER_TRANSITIONS[from] ?? []).includes(to);
}
