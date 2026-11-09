import { prisma } from './prisma';
import { GatewayError, getGateway } from './gateways';

/**
 * Moves a paid order PENDING → CONFIRMED. Only a PENDING order moves (a later
 * verify call can no longer drag a delivered or cancelled order backwards), so
 * it is safe to call from the client verify route, a webhook and the reconcile
 * job at the same time.
 */
export async function confirmOrder(orderId: string) {
  await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'CONFIRMED', paystackStatus: 'success' }
  });
  return prisma.order.findUnique({ where: { id: orderId } });
}

/**
 * Asks the order's own gateway whether it is paid (amount included) and confirms
 * it if so. Returns true only when the order is paid in full. Never trusts a
 * webhook body or redirect: this is the check that counts.
 */
export async function verifyAndConfirm(order: {
  id: string;
  paymentProvider: string;
  paystackRef: string | null;
  totalAmount: number;
}): Promise<boolean> {
  if (!order.paystackRef) return false;
  const gateway = getGateway(order.paymentProvider);
  if (!gateway) return false;
  const result = await gateway.verify(order.paystackRef, order.totalAmount);
  if (result.state === 'amount_mismatch') {
    console.error('[payments] amount mismatch, order not confirmed', { orderId: order.id, gateway: gateway.id });
    return false;
  }
  if (result.state !== 'paid') return false;
  await confirmOrder(order.id);
  return true;
}

/** Gateways with no (or optional) server-to-server confirmation: a paid-and-closed-app order is picked up here. */
const RECONCILED = ['PAYFONTE', 'MYIMO'];
const MIN_AGE_MS = 2 * 60_000; // the customer may still be on the payment page
const MAX_AGE_MS = 48 * 60 * 60_000; // older than this is abandoned
const BATCH = 50;

/** One pass over stale PENDING orders. Returns how many were confirmed. */
export async function reconcilePendingOrders(now = new Date()): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentProvider: { in: RECONCILED },
      paystackRef: { not: null },
      createdAt: { lt: new Date(now.getTime() - MIN_AGE_MS), gt: new Date(now.getTime() - MAX_AGE_MS) }
    },
    orderBy: { createdAt: 'desc' },
    take: BATCH,
    select: { id: true, paymentProvider: true, paystackRef: true, totalAmount: true }
  });

  let confirmed = 0;
  for (const order of orders) {
    try {
      if (await verifyAndConfirm(order)) confirmed++;
    } catch (err) {
      // An outage on one gateway must not stop the rest; the next pass retries.
      if (!(err instanceof GatewayError)) console.error('[reconcile] unexpected error', { orderId: order.id, err });
    }
  }
  if (confirmed) console.warn(`[reconcile] confirmed ${confirmed} paid order(s) the app never verified`);
  return confirmed;
}

let running = false;

/** Runs the reconcile pass every 5 minutes. Assumes a single backend instance (confirmation is idempotent either way). */
export function startOrderReconciler(): void {
  if (process.env.ORDER_RECONCILE_ENABLED === 'false') return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reconcilePendingOrders();
    } catch (err) {
      console.error('[reconcile] pass failed', err);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 5 * 60_000).unref();
}
