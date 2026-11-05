import { kgOf, DELIVERY_FEE } from './pricing';

/** A marketplace listing, reduced to what the reorder suggestion needs. */
export interface ReorderListing {
  id: string;
  vendorId: string;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes: string | null;
  vendor: { businessName: string };
  branch: { name: string; isMain: boolean; city: string | null } | null;
}

export interface ReorderOption {
  listingId: string;
  vendorName: string;
  branchName: string | null;
  city: string | null;
  /** Exactly the size label the order endpoint accepts for this listing. */
  cylinderSize: string;
  unitPrice: number;
  /** Unit price plus the flat delivery fee, for quantity 1. */
  total: number;
  /** The customer has ordered from this vendor before. */
  previous: boolean;
}

const MAX_OPTIONS = 5;

/** The listing's own label for a cylinder of `sizeKg`, or null if it does not sell that size. */
export function sizeLabelFor(listing: Pick<ReorderListing, 'cylinderSizes' | 'otherSizes'>, sizeKg: number): string | null {
  const labels = [...listing.cylinderSizes, ...(listing.otherSizes ?? '').split(',').map((s) => s.trim())];
  return labels.find((l) => kgOf(l) === sizeKg) ?? null;
}

/**
 * Listings that sell the device's cylinder size, best first: vendors the customer
 * has used before, then cheapest. The caller has already restricted `listings` to
 * those that are visible and in stock, so this never offers something unorderable.
 */
export function pickReorderOptions(sizeKg: number, listings: ReorderListing[], previousVendorIds: ReadonlySet<string>): ReorderOption[] {
  const options: ReorderOption[] = [];
  for (const l of listings) {
    const cylinderSize = sizeLabelFor(l, sizeKg);
    if (!cylinderSize) continue;
    const unitPrice = Math.round(l.pricePerKg * sizeKg);
    options.push({
      listingId: l.id,
      vendorName: l.vendor.businessName,
      branchName: l.branch && !l.branch.isMain ? l.branch.name : null,
      city: l.branch?.city ?? null,
      cylinderSize,
      unitPrice,
      total: unitPrice + DELIVERY_FEE,
      previous: previousVendorIds.has(l.vendorId),
    });
  }
  options.sort((a, b) => Number(b.previous) - Number(a.previous) || a.unitPrice - b.unitPrice);
  return options.slice(0, MAX_OPTIONS);
}
