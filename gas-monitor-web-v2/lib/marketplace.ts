/**
 * Public marketplace feed: listings created by vendors who signed up, set up
 * their profile and were approved. Maps backend `GasListing` rows onto the
 * catalog `Listing` shape so the marketplace, listing page and checkout render
 * vendor listings and platform-owned ones (lib/catalog.ts) the same way.
 *
 * Deliberately does not import lib/api.ts — that module pulls in client-only
 * storage, and the listing page fetches from a server component.
 */
import {
  getListing,
  LISTINGS,
  MONITOR_LISTING_ID,
  PER_KG_SIZE,
  type GasType as CatalogGasType,
  type Listing
} from './catalog';
import { NIGERIAN_STATES } from './nigeria';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9000';

type ApiGasType = 'COOKING' | 'MEDICAL' | 'INDUSTRIAL' | 'BULK' | 'OTHER';

export interface PublicListing {
  id: string;
  gasType: ApiGasType;
  customName: string | null;
  pricePerKg: number;
  cylinderSizes: string[];
  otherSizes: string | null;
  inStock: boolean;
  createdAt: string;
  vendor: {
    id: string;
    businessName: string;
    businessAddress: string;
    state: string | null;
    city: string | null;
    bio: string | null;
    logoUrl: string | null;
    lat: number | null;
    lng: number | null;
    phone: string;
  };
}

const GAS_TYPE_MAP: Record<ApiGasType, CatalogGasType | null> = {
  COOKING: 'cooking',
  MEDICAL: 'medical',
  INDUSTRIAL: 'industrial',
  BULK: 'bulk',
  OTHER: null
};

const GAS_TYPE_TITLE: Record<ApiGasType, string> = {
  COOKING: 'Cooking gas refill',
  MEDICAL: 'Medical oxygen supply',
  INDUSTRIAL: 'Industrial gas refill',
  BULK: 'Bulk LPG supply',
  OTHER: 'Gas supply'
};

/** Kilograms in a size label like "12.5 kg", or null for non-weight sizes. */
export function kgOf(size: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*kg/i.exec(size);
  return match ? Number(match[1]) : null;
}

/** Unit price for a size. Vendor listings are priced per kg; others are flat. */
export function priceFor(listing: Listing, size: string): number | undefined {
  const kg = kgOf(size);
  // A listing with no weight sizes is sold per kg ("Per kg" size, qty = kg).
  if (listing.pricePerKg != null) return Math.round(listing.pricePerKg * (kg ?? 1));
  return listing.price;
}

/**
 * Profiles created before vendors picked a state and city only have a
 * free-text business address, so those are inferred by matching it against
 * the Nigerian state/city vocabulary used by the filters.
 */
function locate(address: string): { state: string; city: string } {
  const text = address.toLowerCase();
  const has = (name: string) => new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  for (const s of NIGERIAN_STATES) {
    const city = s.cities.find(has);
    if (city) return { state: s.name, city };
  }
  const state = NIGERIAN_STATES.find((s) => has(s.name));
  return { state: state?.name ?? '', city: '' };
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

export function toCatalogListing(l: PublicListing): Listing {
  const extraSizes = (l.otherSizes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Only weight sizes can be priced from a per-kg rate, so only those are
  // orderable; anything else ("Bulk Tank") is mentioned as on request.
  const allSizes = [...l.cylinderSizes, ...extraSizes];
  const sizes = allSizes.filter((s) => kgOf(s) != null);
  const onRequest = allSizes.filter((s) => kgOf(s) == null);
  const title = l.customName?.trim() || GAS_TYPE_TITLE[l.gasType];
  const gasType = GAS_TYPE_MAP[l.gasType];
  // Vendors pick state and city at sign-up; older profiles fall back to the address.
  const guessed = locate(l.vendor.businessAddress);
  const state = l.vendor.state ?? guessed.state;
  const city = l.vendor.city ?? (l.vendor.state ? '' : guessed.city);
  const weights = sizes.map((s) => kgOf(s)!);
  const baseDescription =
    l.vendor.bio?.trim() || `${title} from ${l.vendor.businessName}, ${l.vendor.businessAddress}.`;

  return {
    id: l.id,
    vendor: l.vendor.businessName,
    initials: initialsOf(l.vendor.businessName),
    color: '#2D7450',
    title,
    description:
      onRequest.length > 0
        ? `${baseDescription} Also available on request: ${onRequest.join(', ')}.`
        : baseDescription,
    category: 'refill',
    gasTypes: gasType ? [gasType] : [],
    sizes: sizes.length > 0 ? sizes : [PER_KG_SIZE],
    location: l.vendor.businessAddress,
    state,
    city,
    lat: l.vendor.lat ?? undefined,
    lng: l.vendor.lng ?? undefined,
    // Uploaded logos are stored as data URLs. Anything else (a remote URL) is
    // not an allowed next/image source, so those vendors keep their initials.
    logo: l.vendor.logoUrl?.startsWith('data:image/') ? l.vendor.logoUrl : undefined,
    // "From" price: the smallest size on offer, or the per-kg rate if none parse.
    price: Math.round(l.pricePerKg * (weights.length > 0 ? Math.min(...weights) : 1)),
    pricePerKg: l.pricePerKg,
    sellerRole: 'vendor',
    contact: { phone: l.vendor.phone },
    rating: 0,
    reviews: 0,
    isOpen: l.inStock,
    hours: l.inStock ? 'In stock' : 'Out of stock',
    verified: true
  };
}

/** Approved vendors' listings. Returns [] when the backend is unreachable. */
export async function fetchVendorListings(init?: RequestInit): Promise<Listing[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/marketplace/listings`, init);
    if (!res.ok) return [];
    const data = (await res.json()) as { listings: PublicListing[] };
    return data.listings.map(toCatalogListing);
  } catch {
    return [];
  }
}

/** 4FG Monitor terms, set by operators in gas-monitor-admin. */
export interface MonitorTerms {
  unitPrice: number;
  deliveryFee: number;
  minQuantity: number;
  maxQuantity: number;
}

/** Current monitor terms, or null when the backend is unreachable. */
export async function fetchMonitorTerms(init?: RequestInit): Promise<MonitorTerms | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/marketplace/monitor`, init);
    if (!res.ok) return null;
    return ((await res.json()) as { monitor: MonitorTerms }).monitor;
  } catch {
    return null;
  }
}

/**
 * Applies admin-set terms to the platform's 4FG Monitor listing. Without them
 * the catalog values stand in for display only — checkout is always charged
 * what the backend prices.
 */
function withMonitorTerms(listing: Listing, terms: MonitorTerms | null): Listing {
  if (listing.id !== MONITOR_LISTING_ID || !terms) return listing;
  return {
    ...listing,
    price: terms.unitPrice,
    deliveryFee: terms.deliveryFee,
    minOrderQty: terms.minQuantity
  };
}

/** A platform-owned listing by id, else an approved vendor's listing. */
export async function findListing(id: string, init?: RequestInit): Promise<Listing | undefined> {
  const local = getListing(id);
  if (local) {
    return local.id === MONITOR_LISTING_ID ? withMonitorTerms(local, await fetchMonitorTerms(init)) : local;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/marketplace/listings/${encodeURIComponent(id)}`, init);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { listing: PublicListing };
    return toCatalogListing(data.listing);
  } catch {
    return undefined;
  }
}

/** Platform-owned listings followed by vendor listings. */
export async function fetchAllListings(init?: RequestInit): Promise<Listing[]> {
  const [terms, vendorListings] = await Promise.all([fetchMonitorTerms(init), fetchVendorListings(init)]);
  return [...LISTINGS.map((l) => withMonitorTerms(l, terms)), ...vendorListings];
}
