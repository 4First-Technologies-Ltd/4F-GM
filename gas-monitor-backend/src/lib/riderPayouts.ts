import { randomUUID } from 'crypto';
import { Prisma, RiderEarning } from '@prisma/client';
import { prisma } from './prisma';
import { getOrCreateSettings } from './settings';
import { PaystackError, createTransferRecipient, initiateTransfer, verifyTransfer } from './paystack';

/**
 * Rider pay: when an order is DELIVERED the rider's cut of its delivery fee (a
 * platform setting, `riderSharePercent`) is recorded as a `RiderEarning` and paid by
 * its own Paystack transfer from the platform's balance, to the bank account on the
 * rider's profile.
 *
 * The transfer only goes out automatically when `RIDER_AUTO_PAYOUT=true`, because it
 * moves real money out of the Paystack balance without anyone clicking. Otherwise
 * the earning waits as PENDING and `dispatchRiderEarning` sends it when asked. A
 * rider with no bank account yet is also left PENDING and is paid once they add one.
 */
export const riderAutoPayoutEnabled = () => process.env.RIDER_AUTO_PAYOUT === 'true';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Credit the rider for a delivered order. Idempotent: orderId is unique, so a
 * repeated delivery event is a no-op. Returns the new earning's id, or null.
 */
export async function recordRiderEarning(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, riderId: true, deliveryFee: true, riderEarning: { select: { id: true } } }
  });
  if (!order || order.status !== 'DELIVERED' || !order.riderId || order.deliveryFee <= 0 || order.riderEarning) {
    return null;
  }

  const { riderSharePercent } = await getOrCreateSettings();
  const amount = round2((order.deliveryFee * riderSharePercent) / 100);
  if (amount <= 0) return null;

  try {
    const created = await prisma.riderEarning.create({
      data: {
        orderId: order.id,
        riderId: order.riderId,
        deliveryFee: order.deliveryFee,
        sharePercent: riderSharePercent,
        amount,
        reference: `rider_${randomUUID()}`
      }
    });
    return created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/**
 * Send (or re-send) a rider's transfer. Safe to repeat: it first asks Paystack
 * whether a transfer with this reference exists, so a request that timed out after
 * Paystack accepted it is adopted instead of duplicated.
 */
export async function dispatchRiderEarning(id: string): Promise<RiderEarning> {
  const earning = await prisma.riderEarning.findUniqueOrThrow({
    where: { id },
    include: { rider: { include: { bankAccount: true, user: { select: { isSuspended: true } } } } }
  });
  if (earning.status === 'PAID' || earning.status === 'PROCESSING') return earning;

  const hold = (reason: string, status: 'PENDING' | 'FAILED' = 'PENDING') =>
    prisma.riderEarning.update({ where: { id }, data: { status, failureReason: reason.slice(0, 500) } });

  try {
    const existing = await verifyTransfer(earning.reference);
    if (existing) return applyRiderTransferStatus(id, existing.status, existing.transfer_code);

    const bank = earning.rider.bankAccount;
    if (!bank) return hold('The rider has not added a bank account yet');
    if (earning.rider.user.isSuspended) return hold('The rider account is suspended');

    // Pay the account snapshotted on the first attempt, not one the rider switched to since.
    const accountNumber = earning.accountNumber ?? bank.accountNumber;
    let recipient = accountNumber === bank.accountNumber ? bank.paystackRecipientCode : null;
    if (!recipient) {
      recipient = await createTransferRecipient({
        name: earning.accountName ?? bank.accountName,
        accountNumber,
        bankCode: bank.bankCode
      });
      if (accountNumber === bank.accountNumber) {
        await prisma.riderBankAccount.update({ where: { id: bank.id }, data: { paystackRecipientCode: recipient } });
      }
    }
    if (!earning.accountNumber) {
      await prisma.riderEarning.update({
        where: { id },
        data: { bankName: bank.bankName, accountNumber: bank.accountNumber, accountName: bank.accountName }
      });
    }

    const transfer = await initiateTransfer({
      amountNaira: earning.amount,
      recipientCode: recipient,
      reference: earning.reference,
      reason: '4FG delivery pay'
    });
    return applyRiderTransferStatus(id, transfer.status, transfer.transfer_code);
  } catch (err) {
    if (err instanceof PaystackError) {
      // No answer means the transfer may exist; stay PENDING so a retry checks the reference first.
      return hold(err.message, err.indeterminate ? 'PENDING' : 'FAILED');
    }
    throw err;
  }
}

/** Map a Paystack transfer status onto a rider earning. Idempotent. */
export async function applyRiderTransferStatus(
  id: string,
  paystackStatus: string,
  transferCode?: string,
  reason?: string
): Promise<RiderEarning> {
  const earning = await prisma.riderEarning.findUniqueOrThrow({ where: { id } });
  if (earning.status === 'PAID') return earning;
  const code = transferCode ?? earning.paystackTransferCode;

  switch (paystackStatus) {
    case 'success':
      return prisma.riderEarning.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), failureReason: null, paystackTransferCode: code }
      });
    case 'failed':
    case 'reversed':
      return prisma.riderEarning.update({
        where: { id },
        data: { status: 'FAILED', paystackTransferCode: code, failureReason: reason ?? `Transfer ${paystackStatus} by Paystack` }
      });
    case 'otp':
      return prisma.riderEarning.update({
        where: { id },
        data: {
          status: 'FAILED',
          paystackTransferCode: code,
          failureReason:
            'Paystack is asking for an OTP to approve this transfer. Disable transfer OTP in the Paystack dashboard to allow API payouts.'
        }
      });
    default: // pending / processing / queued
      return prisma.riderEarning.update({
        where: { id },
        data: { status: 'PROCESSING', paystackTransferCode: code, failureReason: null }
      });
  }
}

/**
 * Fire-and-forget for the delivery handlers: record the rider's earning and, when
 * auto-payout is on, send it. A failure here must never fail the delivery itself.
 */
export function processRiderEarningSafe(orderId: string): void {
  (async () => {
    const id = await recordRiderEarning(orderId);
    if (id && riderAutoPayoutEnabled()) await dispatchRiderEarning(id);
  })().catch((err) => console.error('[rider-pay] failed', { orderId, err }));
}

/**
 * Sends every earning still waiting for a transfer (PENDING or FAILED) for one
 * rider, e.g. after they add a bank account. Returns how many were attempted.
 */
export async function dispatchWaitingForRider(riderId: string): Promise<number> {
  const waiting = await prisma.riderEarning.findMany({
    where: { riderId, status: { in: ['PENDING', 'FAILED'] } },
    select: { id: true }
  });
  for (const { id } of waiting) await dispatchRiderEarning(id);
  return waiting.length;
}
