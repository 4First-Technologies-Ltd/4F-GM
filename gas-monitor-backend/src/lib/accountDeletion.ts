import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Prisma, User } from '@prisma/client';
import { prisma } from './prisma';
import { deleteDocument, deleteImage } from './storage';

/** Orders a paid customer is still waiting on. */
const IN_FLIGHT = ['CONFIRMED', 'OUT_FOR_DELIVERY'] as const;
/** A consumer's own unpaid order counts too: the account is the only way back to it. */
const CONSUMER_OPEN = ['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'] as const;

export class DeletionBlocked extends Error {
  constructor(
    message: string,
    readonly status: 403 | 409 = 409,
    readonly code?: string
  ) {
    super(message);
  }
}

/**
 * Why this account cannot be closed right now, or null when it can. Closing is
 * refused rather than forced whenever someone is owed money or a delivery:
 * customers are waiting on vendors and riders, vendors are owed their earnings.
 */
async function blocker(user: User, byAdmin = false): Promise<DeletionBlocked | null> {
  // The same rules read differently to the account holder and to an admin acting for them.
  const say = (self: string, admin: string) => (byAdmin ? admin : self);
  // Anyone may also have bought gas, whatever their role.
  const open = await prisma.order.count({ where: { consumerId: user.id, status: { in: [...CONSUMER_OPEN] } } });
  if (open > 0) return new DeletionBlocked(say('You have an order in progress. Delete your account once it is complete.', 'This account has an order in progress as a customer. Wait until it is complete.'));

  if (user.role === 'VENDOR') {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (vendor) {
      const [orders, earnings] = await Promise.all([
        prisma.order.count({ where: { vendorId: vendor.id, status: { in: [...IN_FLIGHT] } } }),
        prisma.earning.count({ where: { vendorId: vendor.id, status: { in: ['AVAILABLE', 'IN_PAYOUT'] } } })
      ]);
      if (orders > 0) {
        return new DeletionBlocked(say('You have paid orders still to deliver. Complete or hand them over first.', 'This vendor has paid orders still to deliver. Wait until they are delivered or cancelled.'));
      }
      if (earnings > 0) {
        return new DeletionBlocked(
          say('You have earnings that have not been paid out yet. Contact support to settle them before closing your account.', 'This vendor has earnings that have not been paid out. Settle the payout first (Payouts page).'),
          409,
          'CONTACT_SUPPORT'
        );
      }
    }
  }

  if (user.role === 'RIDER') {
    const rider = await prisma.riderProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (rider && (await prisma.order.count({ where: { riderId: rider.id, status: { in: [...IN_FLIGHT] } } })) > 0) {
      return new DeletionBlocked(say('You have deliveries in progress. Finish them before closing your account.', 'This rider has deliveries in progress. Wait until they are finished.'));
    }
  }

  if (user.role === 'LOGISTICS_COMPANY') {
    const company = await prisma.logisticsCompany.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (
      company &&
      (await prisma.order.count({ where: { rider: { companyId: company.id }, status: { in: [...IN_FLIGHT] } } })) > 0
    ) {
      return new DeletionBlocked(say('Your riders have deliveries in progress. Wait until they are finished.', 'This company\'s riders have deliveries in progress. Wait until they are finished.'));
    }
  }

  return null;
}

/**
 * Self-service erasure for every account type. Orders, earnings and payouts are
 * financial records we must keep, so the account is anonymised in place rather
 * than deleted: personal details, saved addresses, sessions and (for businesses)
 * KYC documents, bank details and photos are removed, and the account is
 * suspended so its listings leave the marketplace and it can never sign in again.
 */
export async function eraseAccount(user: User, password: string): Promise<void> {
  if (!(await bcrypt.compare(password, user.password))) throw new DeletionBlocked('Incorrect password', 403);
  const blocked = await blocker(user);
  if (blocked) throw blocked;
  await anonymise(user);
}

/**
 * Erasure by a super admin (no password: the admin is the authority). Applies
 * exactly the same refusals as self-service, so a customer waiting on a paid
 * delivery or a vendor owed money is never silently dropped.
 */
export async function eraseAccountAsAdmin(user: User): Promise<void> {
  const blocked = await blocker(user, true);
  if (blocked) throw blocked;
  await anonymise(user);
}

async function anonymise(user: User): Promise<void> {

  const email = user.email.toLowerCase();
  const randomPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

  // Object keys to remove from R2 once the database is done.
  const documentKeys: string[] = [];
  const imageKeys: string[] = [];

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    prisma.address.deleteMany({ where: { userId: user.id } }),
    prisma.cylinderProfile.deleteMany({ where: { userId: user.id } }),
    prisma.marketingSuppression.upsert({
      where: { email },
      create: { email, reason: 'account_deleted' },
      update: {}
    })
  ];

  if (user.role === 'VENDOR') {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      include: { documents: { select: { url: true } }, listings: { select: { imageKey: true } } }
    });
    if (vendor) {
      documentKeys.push(...vendor.documents.map((d) => d.url));
      imageKeys.push(...vendor.listings.flatMap((l) => (l.imageKey ? [l.imageKey] : [])));
      if (vendor.logoUrl) imageKeys.push(vendor.logoUrl);
      ops.push(
        prisma.vendorDocument.deleteMany({ where: { vendorId: vendor.id } }),
        prisma.vendorBankAccount.deleteMany({ where: { vendorId: vendor.id } }),
        prisma.gasListing.updateMany({ where: { vendorId: vendor.id }, data: { inStock: false, imageKey: null } }),
        prisma.branch.updateMany({ where: { vendorId: vendor.id }, data: { isActive: false } }),
        prisma.branchStaff.updateMany({
          where: { branch: { vendorId: vendor.id } },
          data: { status: 'REVOKED', tokenHash: null }
        }),
        // The business name stays: customers' past orders still show who they bought from.
        prisma.vendorProfile.update({ where: { id: vendor.id }, data: { phone: '', bio: null, logoUrl: null } })
      );
    }
  }

  if (user.role === 'RIDER') {
    ops.push(
      prisma.riderProfile.updateMany({
        where: { userId: user.id },
        data: {
          phone: '',
          vehicleType: null,
          plateNumber: null,
          lat: null,
          lng: null,
          status: 'REJECTED',
          companyId: null,
          approvedViaCompany: false
        }
      })
    );
  }

  if (user.role === 'BRANCH_MANAGER') {
    ops.push(
      prisma.branchStaff.updateMany({
        where: { userId: user.id },
        data: { status: 'REVOKED', tokenHash: null, email: `deleted-${user.id}@deleted.invalid` }
      })
    );
  }

  if (user.role === 'LOGISTICS_COMPANY') {
    const company = await prisma.logisticsCompany.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (company) {
      ops.push(
        // Riders who were approved only by joining go back to PENDING; independents keep working.
        prisma.riderProfile.updateMany({
          where: { companyId: company.id, approvedViaCompany: true },
          data: { status: 'PENDING', approvedViaCompany: false, companyId: null }
        }),
        prisma.riderProfile.updateMany({ where: { companyId: company.id }, data: { companyId: null } }),
        prisma.fleetInvite.deleteMany({ where: { companyId: company.id } }),
        prisma.logisticsCompany.update({
          where: { id: company.id },
          data: { status: 'REJECTED', phone: '', address: '' }
        })
      );
    }
  }

  ops.push(
    prisma.user.update({
      where: { id: user.id },
      data: {
        email: `deleted-${user.id}@deleted.invalid`,
        name: 'Deleted user',
        phone: null,
        devicePhone: null,
        avatarUrl: null,
        password: randomPassword,
        isSuspended: true,
        emailVerified: false,
        otpCodeHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
        pushEnabled: false,
        emailNotifEnabled: false,
        smsAlertsEnabled: false
      }
    })
  );

  await prisma.$transaction(ops);

  // After commit, best effort: a leftover object is harmless, a failed delete must not undo the erasure.
  await Promise.all([...documentKeys.map(deleteDocument), ...imageKeys.map(deleteImage)]);
}
