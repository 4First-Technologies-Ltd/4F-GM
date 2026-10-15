import type { CompanyStatus, Prisma, RiderStatus } from '@prisma/client';
import { prisma } from './prisma';

/** How long an unclaimed fleet invite stays valid. */
export const FLEET_INVITE_TTL_DAYS = 14;

/** Riders plus open invites a single company may hold. */
export const MAX_FLEET_SIZE = 200;

export function fleetInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + FLEET_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Riders a vendor, branch manager or admin may assign to an order. A rider is
 * assignable when an admin approved them, or when they ride for a company that
 * is currently APPROVED. Deriving it (instead of copying the company's status
 * onto every rider) means rejecting a company pulls its whole fleet off the
 * road at once, and approving it again brings them back.
 *
 * `approvedViaCompany` with no company left (company deleted) is not approved:
 * joining the fleet was the only vetting that rider had.
 */
export const ASSIGNABLE_RIDER: Prisma.RiderProfileWhereInput = {
  status: 'APPROVED',
  OR: [{ companyId: null, approvedViaCompany: false }, { company: { status: 'APPROVED' } }]
};

/** What `effectiveRiderStatus` needs from a rider row. */
export const RIDER_STATUS_SELECT = {
  status: true,
  companyId: true,
  approvedViaCompany: true,
  company: { select: { status: true } }
} as const;

/** The status a rider should act on: APPROVED only while their vetting still stands. */
export function effectiveRiderStatus(r: {
  status: RiderStatus;
  companyId?: string | null;
  approvedViaCompany?: boolean;
  company?: { status: CompanyStatus } | null;
}): RiderStatus {
  if (r.status !== 'APPROVED') return r.status;
  if (r.company) return r.company.status === 'APPROVED' ? 'APPROVED' : 'PENDING';
  if (r.approvedViaCompany && !r.companyId) return 'PENDING';
  return 'APPROVED';
}

/**
 * Join a fleet if this rider's verified email has a live invite from an APPROVED
 * company. Called after the rider has a profile (profile create, `/me`).
 *
 * - A rider an admin REJECTED is never pulled in: the company cannot override
 *   an admin's decision.
 * - A rider already in another fleet is left alone.
 * - A PENDING rider is approved by joining (`approvedViaCompany`); an already
 *   approved independent rider just gains the company link.
 *
 * Returns true if the rider joined.
 */
export async function claimFleetInvite(user: { id: string; email: string; emailVerified: boolean }): Promise<boolean> {
  if (!user.emailVerified) return false;

  const profile = await prisma.riderProfile.findUnique({ where: { userId: user.id } });
  if (!profile || profile.status === 'REJECTED') return false;

  const invite = await prisma.fleetInvite.findFirst({
    where: {
      email: { equals: user.email, mode: 'insensitive' },
      status: 'INVITED',
      expiresAt: { gt: new Date() },
      company: { status: 'APPROVED' }
    },
    orderBy: { createdAt: 'asc' }
  });
  if (!invite) return false;
  if (profile.companyId && profile.companyId !== invite.companyId) return false;

  // Claim the invite with a compare-and-set so two requests cannot both join.
  const claimed = await prisma.fleetInvite.updateMany({
    where: { id: invite.id, status: 'INVITED' },
    data: { status: 'ACTIVE', userId: user.id }
  });
  if (claimed.count === 0) return false;

  await prisma.riderProfile.update({
    where: { id: profile.id },
    data: {
      companyId: invite.companyId,
      ...(profile.status === 'PENDING' ? { status: 'APPROVED', approvedViaCompany: true } : {})
    }
  });
  return true;
}

/**
 * Remove a rider from a fleet. A rider who was approved only by joining goes
 * back to PENDING; one an admin approved on their own keeps working.
 */
export async function removeFromFleet(companyId: string, invite: { id?: string; userId: string | null }): Promise<void> {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (invite.id) ops.push(prisma.fleetInvite.update({ where: { id: invite.id }, data: { status: 'REVOKED' } }));
  if (invite.userId) {
    const rider = await prisma.riderProfile.findFirst({ where: { userId: invite.userId, companyId } });
    if (rider) {
      ops.push(
        prisma.riderProfile.update({
          where: { id: rider.id },
          data: {
            companyId: null,
            ...(rider.approvedViaCompany ? { status: 'PENDING', approvedViaCompany: false } : {})
          }
        })
      );
    }
  }
  await prisma.$transaction(ops);
}
