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
  supplierName: string;
  unitPrice: number;
  totalAmount: number;
  listingId?: string;
  vendorId?: string;
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
  quantity: number
): Promise<PricedOrder> {
  const listing = await prisma.gasListing.findFirst({
    where: { id: listingId, inStock: true, vendor: { status: 'APPROVED', user: { isSuspended: false } } },
    select: {
      id: true,
      vendorId: true,
      pricePerKg: true,
      cylinderSizes: true,
      otherSizes: true,
      vendor: { select: { businessName: true } }
    }
  });
  if (!listing) throw new PricingError('This listing is no longer available', 404);

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
    vendorId: listing.vendorId
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
