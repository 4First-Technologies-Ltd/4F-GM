import { prisma } from './prisma';
import { getOrCreateSettings } from './settings';

/**
 * Server-side order pricing. The client sends what it wants to buy; the amount
 * charged is always worked out here, so an edited request cannot pay less.
 *
 * 4FG Monitor price, delivery fee and minimum quantity are set by operators in
 * gas-monitor-admin (PlatformSettings). The vendor delivery fee and order limit
 * below are mirrored in gas-monitor-web-v2 `lib/catalog.ts` for display.
 */

/** Flat delivery fee added to vendor listing orders, in naira. */
export const DELIVERY_FEE = 2000;

/** Largest quantity any order may carry. The 4FG Monitor ships in tens. */
export const MAX_ORDER_QUANTITY = 20;

/** Size label used for listings sold loose by the kilogram (quantity = kg). */
export const PER_KG_SIZE = 'Per kg';

/**
 * Size sent when a customer buys loose gas by weight or by money (see
 * `LooseRequest`). The stored order carries a readable label like
 * "3.5 kg (loose)" with quantity 1, so every screen that shows
 * "size × quantity" keeps working without knowing about loose orders.
 */
export const LOOSE_SIZE = 'Loose';
export const MIN_LOOSE_KG = 0.5;
export const MAX_LOOSE_KG = 100;

/** How much loose gas: exactly one of `kg` (to 0.1 kg) or `amount` (whole naira of gas, delivery extra). */
export type LooseRequest = { kg?: number; amount?: number };

/**
 * Products sold by the platform itself rather than a marketplace vendor. Only
 * identity lives here; commercial terms come from admin settings.
 */
export const PLATFORM_PRODUCTS = {
  MONITOR: {
    supplierName: '4First Technologies Limited',
    sizes: ['Universal']
  }
} as const;

export type PlatformProduct = keyof typeof PLATFORM_PRODUCTS;

export type MonitorTerms = {
  unitPrice: number;
  deliveryFee: number;
  minQuantity: number;
  maxQuantity: number;
};

/** Current 4FG Monitor terms, as set in the admin dashboard. */
export async function getMonitorTerms(): Promise<MonitorTerms> {
  const settings = await getOrCreateSettings();
  return {
    unitPrice: settings.monitorUnitPrice,
    deliveryFee: settings.monitorDeliveryFee,
    minQuantity: settings.monitorMinQuantity,
    maxQuantity: MAX_ORDER_QUANTITY
  };
}

export type PricedOrder = {
  /** Set when the server decides the stored size label / quantity (loose orders). */
  cylinderSize?: string;
  quantity?: number;
  supplierName: string;
  unitPrice: number;
  totalAmount: number;
  listingId?: string;
  vendorId?: string;
  branchId?: string;
};

export class PricingError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/** Kilograms in a size label like "12.5 kg", or null for non-weight sizes. */
export function kgOf(size: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*kg/i.exec(size);
  return match ? Number(match[1]) : null;
}

function withDelivery(unitPrice: number, quantity: number, deliveryFee: number) {
  return unitPrice * quantity + deliveryFee;
}

/**
 * Prices an order for an approved vendor's listing. Vendor listings are priced
 * per kg, so only weight sizes the vendor actually offers can be ordered — or
 * `Per kg` when the listing has no weight sizes at all.
 */
export async function priceListingOrder(
  listingId: string,
  cylinderSize: string,
  quantity: number,
  loose: LooseRequest = {}
): Promise<PricedOrder> {
  const listing = await prisma.gasListing.findFirst({
    where: {
      id: listingId,
      inStock: true,
      vendor: { status: 'APPROVED', user: { isSuspended: false } },
      OR: [{ branchId: null }, { branch: { isActive: true, suspendedAt: null } }]
    },
    select: {
      id: true,
      vendorId: true,
      branchId: true,
      pricePerKg: true,
      cylinderSizes: true,
      otherSizes: true,
      sellsLoose: true,
      vendor: { select: { businessName: true } }
    }
  });
  if (!listing) throw new PricingError('This listing is no longer available', 404);

  if (cylinderSize === LOOSE_SIZE) {
    return priceLooseOrder(listing, quantity, loose);
  }
  if (loose.kg != null || loose.amount != null) {
    throw new PricingError('Choose loose gas to order by weight or amount');
  }

  const offered = [
    ...listing.cylinderSizes,
    ...(listing.otherSizes ?? '').split(',').map((s) => s.trim())
  ].filter((s) => kgOf(s) != null);

  let kg: number;
  if (offered.length === 0 && cylinderSize === PER_KG_SIZE) {
    kg = 1;
  } else if (offered.includes(cylinderSize)) {
    kg = kgOf(cylinderSize)!;
  } else {
    throw new PricingError(`${listing.vendor.businessName} does not sell the ${cylinderSize} size`);
  }

  const unitPrice = Math.round(listing.pricePerKg * kg);
  return {
    supplierName: listing.vendor.businessName,
    unitPrice,
    totalAmount: withDelivery(unitPrice, quantity, DELIVERY_FEE),
    listingId: listing.id,
    vendorId: listing.vendorId,
    branchId: listing.branchId ?? undefined
  };
}

export function priceLooseOrder(
  listing: { id: string; vendorId: string; branchId: string | null; pricePerKg: number; sellsLoose: boolean; vendor: { businessName: string } },
  quantity: number,
  loose: LooseRequest
): PricedOrder {
  if (!listing.sellsLoose) {
    throw new PricingError(`${listing.vendor.businessName} does not sell loose gas on this listing`);
  }
  if (quantity !== 1) throw new PricingError('Loose gas orders have a quantity of 1');
  if ((loose.kg == null) === (loose.amount == null)) {
    throw new PricingError('Give either the kilograms or the amount, not both');
  }

  let kg: number;
  let gasCost: number;
  if (loose.kg != null) {
    kg = Math.round(loose.kg * 10) / 10;
    gasCost = Math.round(listing.pricePerKg * kg);
  } else {
    // The customer pays exactly this much for gas; the kg is what it buys, rounded down to 0.01.
    gasCost = Math.round(loose.amount!);
    kg = Math.floor((gasCost / listing.pricePerKg) * 100) / 100;
  }
  if (kg < MIN_LOOSE_KG) throw new PricingError(`The minimum is ${MIN_LOOSE_KG} kg of gas`);
  if (kg > MAX_LOOSE_KG) throw new PricingError(`The most you can order at once is ${MAX_LOOSE_KG} kg`);

  return {
    cylinderSize: `${Number(kg.toFixed(2))} kg (loose)`,
    quantity: 1,
    supplierName: listing.vendor.businessName,
    unitPrice: gasCost,
    totalAmount: withDelivery(gasCost, 1, DELIVERY_FEE),
    listingId: listing.id,
    vendorId: listing.vendorId,
    branchId: listing.branchId ?? undefined
  };
}

export async function pricePlatformOrder(
  product: PlatformProduct,
  cylinderSize: string,
  quantity: number
): Promise<PricedOrder> {
  const item = PLATFORM_PRODUCTS[product];
  if (!(item.sizes as readonly string[]).includes(cylinderSize)) {
    throw new PricingError(`Unknown size ${cylinderSize}`);
  }
  const terms = await getMonitorTerms();
  if (quantity < terms.minQuantity) {
    throw new PricingError(`Minimum order is ${terms.minQuantity} units`);
  }
  return {
    supplierName: item.supplierName,
    unitPrice: terms.unitPrice,
    totalAmount: withDelivery(terms.unitPrice, quantity, terms.deliveryFee)
  };
}
