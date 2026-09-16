export type Category = 'refill' | 'cylinder' | 'monitor' | 'accessories';

/**
 * Who is behind a listing.
 *  - `vendor`       marketplace gas vendor (refills, cylinders, accessories)
 *  - `manufacturer` 4First Technologies — the only seller of the 4FG Monitor
 *  - `dealer`       authorized 4FG Monitor dealer: retails single units,
 *                   reached by phone/e-mail rather than platform checkout
 */
export type SellerRole = 'vendor' | 'manufacturer' | 'dealer';

/** The manufacturer. Only this seller may list the 4FG Monitor for sale. */
export const MANUFACTURER = '4First Technologies Limited';

/** Minimum order quantity on the 4FG Monitor, in units. */
export const MONITOR_MOQ = 10;

/** The manufacturer's 4FG Monitor listing — the one place to buy the device. */
export const MONITOR_LISTING_ID = 'l9';

export type GasType = 'cooking' | 'medical' | 'industrial' | 'bulk';

export interface Listing {
  id: string;
  vendor: string;
  initials: string;
  color: string;
  title: string;
  description: string;
  category: Category;
  gasTypes: GasType[];
  sizes: string[];
  location: string;
  state: string;
  city: string;
  /** Approximate coordinates, used to place the pin on the location map. */
  lat?: number;
  lng?: number;
  image?: string;
  /** Seller brand logo (transparent background). Initials are shown without one. */
  logo?: string;
  gallery?: { src: string; alt: string; tone: 'dark' | 'light' }[];
  /** Absent for dealers — their retail price is agreed on contact, not here. */
  price?: number;
  /** Vendor listings are priced per kg; the unit price then depends on size. */
  pricePerKg?: number;
  /** Minimum order quantity. The 4FG Monitor ships in tens. */
  minOrderQty?: number;
  /** Per-order delivery fee when it differs from DELIVERY_FEE (the 4FG Monitor's is admin-set). */
  deliveryFee?: number;
  /** Defaults to `vendor` when absent. */
  sellerRole?: SellerRole;
  /** Full contact route for dealers, who sell off-platform. */
  contact?: { phone: string; email?: string };
  rating: number;
  reviews: number;
  isOpen: boolean;
  hours: string;
  featured?: boolean;
  deliveryToday?: boolean;
  verified?: boolean;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  refill: 'Gas refill',
  cylinder: 'Cylinders',
  monitor: '4FG Monitor',
  accessories: 'Accessories'
};

export const GAS_TYPE_LABEL: Record<GasType, string> = {
  cooking: 'Cooking gas',
  medical: 'Medical O₂',
  industrial: 'Industrial',
  bulk: 'Bulk LPG'
};

export const SELLER_ROLE_LABEL: Record<SellerRole, string> = {
  vendor: 'Vendor',
  manufacturer: 'Manufacturer',
  dealer: 'Authorized dealer'
};

export function sellerRoleOf(listing: Listing): SellerRole {
  return listing.sellerRole ?? 'vendor';
}

/**
 * Whether the listing can go through platform checkout. Dealers retail the
 * monitor themselves, but off-platform — customers contact them directly, so
 * there is no price or cart for a dealer listing here.
 */
export function isPurchasable(listing: Listing): boolean {
  return sellerRoleOf(listing) !== 'dealer' && typeof listing.price === 'number';
}

/** Floor on the quantity selector; 1 for everything but the 4FG Monitor. */
export function minQuantityFor(listing: Listing): number {
  return listing.minOrderQty ?? 1;
}

/** Authorized dealers for the 4FG Monitor, nearest-state-first when given one. */
export function monitorDealers(state?: string): Listing[] {
  const dealers = LISTINGS.filter((l) => sellerRoleOf(l) === 'dealer');
  if (!state || state === 'all') return dealers;
  return [...dealers].sort((a, b) =>
    a.state === state === (b.state === state) ? 0 : a.state === state ? -1 : 1
  );
}

export const SIZES = ['6 kg', '12.5 kg', '25 kg', '50 kg'];

// Vendor-listing delivery fee and order limit. Mirror
// gas-monitor-backend/src/lib/pricing.ts, which prices the order; the web only
// previews these numbers. 4FG Monitor terms are admin-set, not listed here.
export const DELIVERY_FEE = 2000;

export const MAX_QUANTITY = 20;

/** Size for vendor listings sold loose by the kilogram (quantity = kg). */
export const PER_KG_SIZE = 'Per kg';

export function getListing(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

/**
 * Platform-owned listings only. Every other merchant signs up as a vendor
 * (/sign-up?role=vendor), sets up their own profile and adds their listings
 * from the vendor dashboard, so no third-party seller is hardcoded here.
 */
export const LISTINGS: Listing[] = [
  {
    // The only sellable 4FG Monitor listing on the marketplace.
    id: 'l9',
    vendor: MANUFACTURER,
    initials: '4F',
    logo: '/images/brands/4first-technologies.png',
    color: '#2D7450',
    title: '4FG Smart Gas Monitor',
    description:
      'Know your exact gas level, get refill alerts, and reorder in one tap. The 4FG Monitor connects to any standard LPG cylinder. Sold direct by 4First Technologies Limited in trade packs of 10 units or more.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: 'Imo Digital City, 23 Egbu Road, Owerri',
    lat: 5.4901,
    lng: 7.0442,
    state: 'Imo',
    city: 'Owerri',
    // Fallback only: the live price, delivery fee and minimum order come from
    // admin settings via lib/marketplace.ts `withMonitorTerms`.
    price: 45000,
    minOrderQty: MONITOR_MOQ,
    sellerRole: 'manufacturer',
    contact: { phone: '+234 906 476 8335', email: '4fg@4firsttechnologies.com' },
    rating: 4.9,
    reviews: 124,
    isOpen: true,
    hours: '8am – 6pm',
    featured: true,
    deliveryToday: false,
    verified: true
  }
];

export const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
