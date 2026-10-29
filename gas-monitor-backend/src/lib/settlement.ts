import { prisma } from './prisma';
import { PLANS } from './plans';
import { splitOrder } from './earnings';
import type { PaymentGateway, PaymentSplit } from './gateways';

/**
 * Split settlement: at checkout the gateway pays the vendor their share straight
 * into their bank; the platform keeps the commission and the delivery fee.
 *
 * It is OFF unless `GATEWAY_SPLIT_SETTLEMENT=true`, because turning it on sends
 * real bank details to the payment gateways and moves real money. Even when on, a
 * vendor with no payout account simply isn't split: that order is paid out later
 * through the normal earnings payout, so checkout never fails for lack of one.
 */
export const splitSettlementEnabled = () => process.env.GATEWAY_SPLIT_SETTLEMENT === 'true';

export interface VendorSplitPlan {
  split: PaymentSplit;
  /** What the vendor receives, in naira. Stored on the order. */
  vendorAmount: number;
}

/** The vendor's share of an order: gas price (total minus delivery fee) less the plan's commission. */
export function vendorShare(totalAmount: number, deliveryFee: number, commissionPercent: number): number {
  return splitOrder(totalAmount - deliveryFee, commissionPercent).netAmount;
}

type Recipients = Record<string, string>;

/**
 * The vendor's payee code on this gateway, registering the bank account the first
 * time and caching the code. Returns null when the vendor has no payout account.
 */
async function vendorRecipient(
  gateway: PaymentGateway,
  vendorId: string,
  businessName: string,
  contact: { email: string; phone: string }
): Promise<string | null> {
  if (!gateway.ensureRecipient) return null;
  const bank = await prisma.vendorBankAccount.findUnique({ where: { vendorId } });
  if (!bank) return null;

  const known = (bank.gatewayRecipients ?? {}) as Recipients;
  if (known[gateway.id]) return known[gateway.id];

  const code = await gateway.ensureRecipient({
    name: businessName,
    bankCode: bank.bankCode,
    bankName: bank.bankName,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
    email: contact.email,
    phone: contact.phone
  });

  // Only store against the account we registered: if the vendor changed it in the
  // meantime, the code belongs to the old one and must not be cached.
  await prisma.vendorBankAccount.updateMany({
    where: { id: bank.id, accountNumber: bank.accountNumber, bankCode: bank.bankCode },
    data: { gatewayRecipients: { ...known, [gateway.id]: code } }
  });
  return code;
}

/**
 * Works out how to split a vendor order on `gateway`, or returns null when it
 * should be paid in the ordinary way (feature off, gateway can't split, no vendor,
 * no delivery fee on record, vendor has no payout account, or nothing left to send).
 */
export async function planVendorSplit(
  gateway: PaymentGateway,
  order: { totalAmount: number; deliveryFee: number; vendorId: string | null }
): Promise<VendorSplitPlan | null> {
  if (!splitSettlementEnabled() || !gateway.capabilities.split || !order.vendorId || order.deliveryFee <= 0) {
    return null;
  }
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: order.vendorId },
    select: { plan: true, businessName: true, phone: true, user: { select: { email: true } } }
  });
  if (!vendor) return null;

  const vendorAmount = vendorShare(order.totalAmount, order.deliveryFee, PLANS[vendor.plan].commissionPercent);
  if (vendorAmount <= 0 || vendorAmount >= order.totalAmount) return null;

  let recipientCode: string | null;
  try {
    recipientCode = await vendorRecipient(gateway, order.vendorId, vendor.businessName, {
      email: vendor.user.email,
      phone: vendor.phone
    });
  } catch (err) {
    // Registering the payee failed. Don't block the customer: pay the vendor later instead.
    console.error('[settlement] could not register vendor payee', { vendorId: order.vendorId, gateway: gateway.id, err });
    return null;
  }
  if (!recipientCode) return null;

  return { split: { legs: [{ recipientCode, amountNaira: vendorAmount }] }, vendorAmount };
}
