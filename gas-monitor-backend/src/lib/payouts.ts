import { randomUUID } from 'crypto';
import { Payout } from '@prisma/client';
import { prisma } from './prisma';
import { PaystackError, createTransferRecipient, initiateTransfer, verifyTransfer } from './paystack';

/** Below this a transfer costs more in fees than it moves. Naira. */
export const MIN_PAYOUT_NAIRA = 1000;

export class PayoutError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function availableBalance(vendorId: string) {
  const agg = await prisma.earning.aggregate({
    where: { vendorId, status: 'AVAILABLE' },
    _sum: { netAmount: true },
    _count: true
  });
  return { amount: Math.round((agg._sum.netAmount ?? 0) * 100) / 100, count: agg._count };
}

/**
 * Lock a vendor's available earnings into one payout and send it. The earnings
 * are claimed with a compare-and-set (status AVAILABLE → IN_PAYOUT) inside the
 * same transaction that creates the payout, so two admins clicking at once can
 * never pay the same earning twice.
 */
export async function initiatePayout(vendorId: string, actor: { id: string; name: string }): Promise<Payout> {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorId },
    include: { bankAccount: true, user: { select: { isSuspended: true } } }
  });
  if (!vendor) throw new PayoutError('Vendor not found', 404);
  if (vendor.status !== 'APPROVED' || vendor.user.isSuspended) {
    throw new PayoutError('Only approved, active vendors can be paid out');
  }
  if (!vendor.bankAccount) throw new PayoutError('This vendor has no bank account on file');
  const bank = vendor.bankAccount;

  const payout = await prisma.$transaction(async (tx) => {
    const earnings = await tx.earning.findMany({
      where: { vendorId, status: 'AVAILABLE' },
      select: { id: true, netAmount: true }
    });
    const amount = Math.round(earnings.reduce((sum, e) => sum + e.netAmount, 0) * 100) / 100;
    if (amount < MIN_PAYOUT_NAIRA) {
      throw new PayoutError(`Available balance is below the ₦${MIN_PAYOUT_NAIRA.toLocaleString()} minimum payout`);
    }

    const created = await tx.payout.create({
      data: {
        vendorId,
        amount,
        reference: `payout_${randomUUID()}`,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
        initiatedById: actor.id,
        initiatedByName: actor.name
      }
    });

    const { count } = await tx.earning.updateMany({
      where: { id: { in: earnings.map((e) => e.id) }, status: 'AVAILABLE' },
      data: { status: 'IN_PAYOUT', payoutId: created.id }
    });
    if (count !== earnings.length) {
      // Someone else claimed some of them between our read and write.
      throw new PayoutError('Balance changed while creating the payout — try again', 409);
    }
    return created;
  });

  return dispatchPayout(payout.id);
}

/**
 * Send (or re-send) a payout to Paystack. Safe to call repeatedly: before
 * sending it asks Paystack whether a transfer with this reference already
 * exists, so a request that timed out after Paystack accepted it is adopted
 * instead of duplicated.
 */
export async function dispatchPayout(payoutId: string): Promise<Payout> {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { vendor: { include: { bankAccount: true } } }
  });
  if (!payout) throw new PayoutError('Payout not found', 404);
  if (payout.status === 'PAID' || payout.status === 'CANCELLED' || payout.status === 'PROCESSING') {
    return payout;
  }

  const fail = (reason: string, status: 'FAILED' | 'PENDING' = 'FAILED') =>
    prisma.payout.update({ where: { id: payoutId }, data: { status, failureReason: reason.slice(0, 500) } });

  try {
    const existing = await verifyTransfer(payout.reference);
    if (existing) return applyTransferStatus(payout.id, existing.status, existing.transfer_code);

    const bank = payout.vendor.bankAccount;
    if (!bank) return fail('Vendor bank account was removed');

    // Pay the account snapshotted on the payout, not whatever the vendor has
    // since switched to. The cached recipient code only applies if unchanged.
    let recipient = bank.accountNumber === payout.accountNumber ? bank.paystackRecipientCode : null;
    if (!recipient) {
      recipient = await createTransferRecipient({
        name: payout.accountName,
        accountNumber: payout.accountNumber,
        bankCode: bank.bankCode
      });
      if (bank.accountNumber === payout.accountNumber) {
        await prisma.vendorBankAccount.update({ where: { id: bank.id }, data: { paystackRecipientCode: recipient } });
      }
    }

    const transfer = await initiateTransfer({
      amountNaira: payout.amount,
      recipientCode: recipient,
      reference: payout.reference,
      reason: '4FG vendor payout'
    });
    return applyTransferStatus(payout.id, transfer.status, transfer.transfer_code);
  } catch (err) {
    if (err instanceof PaystackError) {
      // No answer means the transfer may exist; keep it PENDING so a retry
      // verifies by reference first rather than assuming it failed.
      return fail(err.message, err.indeterminate ? 'PENDING' : 'FAILED');
    }
    throw err;
  }
}

/** Map a Paystack transfer status onto our payout (and its earnings). Idempotent. */
export async function applyTransferStatus(
  payoutId: string,
  paystackStatus: string,
  transferCode?: string,
  reason?: string
): Promise<Payout> {
  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
  if (payout.status === 'PAID' || payout.status === 'CANCELLED') return payout;

  switch (paystackStatus) {
    case 'success':
      return markPaid(payoutId, transferCode);
    case 'failed':
    case 'reversed':
      return prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'FAILED',
          paystackTransferCode: transferCode ?? payout.paystackTransferCode,
          failureReason: reason ?? `Transfer ${paystackStatus} by Paystack`
        }
      });
    case 'otp':
      return prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'FAILED',
          paystackTransferCode: transferCode ?? payout.paystackTransferCode,
          failureReason:
            'Paystack is asking for an OTP to approve this transfer. Disable transfer OTP in the Paystack dashboard (Settings → Preferences) to allow API payouts.'
        }
      });
    default: // pending / processing / queued
      return prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PROCESSING',
          paystackTransferCode: transferCode ?? payout.paystackTransferCode,
          failureReason: null
        }
      });
  }
}

export async function markPaid(payoutId: string, transferCode?: string): Promise<Payout> {
  const [payout] = await prisma.$transaction([
    prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        failureReason: null,
        ...(transferCode ? { paystackTransferCode: transferCode } : {})
      }
    }),
    prisma.earning.updateMany({ where: { payoutId }, data: { status: 'PAID' } })
  ]);
  return payout;
}

/** Abandon a payout that hasn't been paid: its earnings return to the vendor's available balance. */
export async function cancelPayout(payoutId: string): Promise<Payout> {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new PayoutError('Payout not found', 404);
  if (payout.status !== 'FAILED' && payout.status !== 'PENDING') {
    throw new PayoutError(`A ${payout.status.toLowerCase()} payout cannot be cancelled`, 409);
  }

  // A PENDING payout whose request timed out might still be live at Paystack.
  if (payout.status === 'PENDING') {
    const live = await verifyTransfer(payout.reference).catch(() => undefined);
    if (live === undefined) {
      throw new PayoutError('Could not confirm the transfer state with Paystack — try again shortly', 502);
    }
    if (live) {
      await applyTransferStatus(payout.id, live.status, live.transfer_code);
      throw new PayoutError('Paystack already has this transfer, so it was synced instead of cancelled', 409);
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.payout.update({ where: { id: payoutId }, data: { status: 'CANCELLED' } }),
    prisma.earning.updateMany({ where: { payoutId }, data: { status: 'AVAILABLE', payoutId: null } })
  ]);
  return updated;
}
