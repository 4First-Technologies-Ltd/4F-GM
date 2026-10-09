import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { PLANS } from './plans';

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
      vendorId: true,
      vendor: { select: { plan: true } },
      earning: { select: { id: true } }
    }
  });
  if (!order || order.status !== 'DELIVERED' || !order.vendorId || !order.vendor || order.earning) {
    return false;
  }

  try {
    await prisma.earning.create({
      data: {
        orderId: order.id,
        vendorId: order.vendorId,
        ...splitOrder(order.totalAmount, PLANS[order.vendor.plan].commissionPercent)
      }
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}

/** Fire-and-forget wrapper for status handlers: a ledger failure must not fail the delivery. */
export function recordEarningSafe(orderId: string): void {
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
