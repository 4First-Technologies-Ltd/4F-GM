import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { PLANS } from './plans';
import { processRiderEarningSafe } from './riderPayouts';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The split of one delivered order between the vendor and the platform. */
export function splitOrder(totalAmount: number, commissionPercent: number) {
  const commissionAmount = round2((totalAmount * commissionPercent) / 100);
  return {
    grossAmount: round2(totalAmount),
    commissionPercent,
    commissionAmount,
    netAmount: round2(totalAmount - commissionAmount)
  };
}

/**
 * Credit the vendor for a delivered marketplace order. Idempotent: orderId is
 * unique on Earning, so a repeated call (vendor and rider both marking
 * delivered, or the backfill racing a live transition) is a no-op.
 *
 * Orders with no vendor are monitor-device sales made by 4First direct and earn
 * nothing for anyone to pay out.
 */
export async function recordEarning(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      deliveryFee: true,
      vendorSettledByGateway: true,
      vendorSplitAmount: true,
      vendorId: true,
      vendor: { select: { plan: true } },
      earning: { select: { id: true } }
    }
  });
  if (!order || order.status !== 'DELIVERED' || !order.vendorId || !order.vendor || order.earning) {
    return false;
  }

  // The delivery fee belongs to the platform (and the rider), so commission is taken on
  // the gas alone. Orders placed before the fee was recorded (deliveryFee 0) keep the old maths.
  const gas = round2(order.totalAmount - order.deliveryFee);

  let amounts: ReturnType<typeof splitOrder>;
  let status: 'AVAILABLE' | 'SETTLED' = 'AVAILABLE';
  if (order.vendorSettledByGateway && order.vendorSplitAmount != null) {
    // The gateway already paid the vendor exactly this at checkout, so the ledger records
    // what was really sent (not today's plan) and marks it so no payout ever repeats it.
    const commissionAmount = round2(gas - order.vendorSplitAmount);
    amounts = {
      grossAmount: gas,
      commissionPercent: gas > 0 ? round2((commissionAmount / gas) * 100) : 0,
      commissionAmount,
      netAmount: round2(order.vendorSplitAmount)
    };
    status = 'SETTLED';
  } else {
    amounts = splitOrder(gas, PLANS[order.vendor.plan].commissionPercent);
  }

  try {
    await prisma.earning.create({
      data: { orderId: order.id, vendorId: order.vendorId, ...amounts, status }
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}

/** Fire-and-forget wrapper for status handlers: a ledger failure must not fail the delivery. */
export function recordEarningSafe(orderId: string): void {
  // The rider's cut of the delivery fee is recorded at the same moment (see riderPayouts.ts).
  processRiderEarningSafe(orderId);
  recordEarning(orderId).catch((err) => console.error('[earnings] failed to record earning', { orderId, err }));
}

/**
 * Backfill: credit every delivered vendor order that has no earning yet — the
 * orders delivered before the ledger existed, plus any missed transition.
 */
export async function syncEarnings(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { status: 'DELIVERED', vendorId: { not: null }, earning: null },
    select: { id: true }
  });
  let created = 0;
  for (const { id } of orders) {
    if (await recordEarning(id)) created += 1;
  }
  return created;
}
