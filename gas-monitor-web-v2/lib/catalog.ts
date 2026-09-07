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
  gallery?: { src: string; alt: string; tone: 'dark' | 'light' }[];
  /** Absent for dealers — their retail price is agreed on contact, not here. */
  price?: number;
  /** Minimum order quantity. The 4FG Monitor ships in tens. */
  minOrderQty?: number;
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

export const DELIVERY_FEE = 1500;

export const MAX_QUANTITY = 10;

export function getListing(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

export const LISTINGS: Listing[] = [
  {
    id: 'l1',
    vendor: 'Ardova Gas Ltd',
    initials: 'AG',
    color: '#2D7450',
    title: '12.5 kg cooking gas refill',
    description:
      'Certified LPG refill for your 12.5 kg cylinder, filled to exact weight and sealed before dispatch. Delivered by Ardova Gas Ltd from Lekki Phase 1.',
    category: 'refill',
    gasTypes: ['cooking'],
    sizes: ['6 kg', '12.5 kg', '50 kg'],
    location: '14 Admiralty Way, Lekki Phase 1',
    state: 'Lagos',
    city: 'Lekki',
    price: 11500,
    rating: 4.8,
    reviews: 214,
    isOpen: true,
    hours: '7am – 9pm',
    featured: true,
    deliveryToday: true,
    verified: true
  },
  {
    id: 'l2',
    vendor: 'HomeGas Express',
    initials: 'HG',
    color: '#2D7450',
    title: '6 kg cooking gas refill',
    description:
      'Quick LPG refill for compact 6 kg cylinders — ideal for small households and student apartments. Same-day delivery within Surulere.',
    category: 'refill',
    gasTypes: ['cooking'],
    sizes: ['6 kg', '12.5 kg'],
    location: '18 Bode Thomas St, Surulere',
    state: 'Lagos',
    city: 'Surulere',
    price: 5800,
    rating: 4.3,
    reviews: 96,
    isOpen: true,
    hours: '8am – 7pm',
    deliveryToday: true,
    verified: true
  },
  {
    id: 'l3',
    vendor: 'Total Gas Depot',
    initials: 'TG',
    color: '#D14700',
    title: '50 kg bulk LPG refill',
    description:
      'High-volume LPG refill for restaurants, bakeries, and commercial kitchens. Weighed and certified at the Ikoyi depot before delivery.',
    category: 'refill',
    gasTypes: ['cooking', 'bulk'],
    sizes: ['12.5 kg', '50 kg'],
    location: '5 Kingsway Rd, Ikoyi',
    state: 'Lagos',
    city: 'Ikoyi',
    price: 43000,
    rating: 4.5,
    reviews: 158,
    isOpen: true,
    hours: '6am – 8pm',
    featured: true,
    verified: true
  },
  {
    id: 'l4',
    vendor: 'MedGas Nigeria',
    initials: 'MG',
    color: '#1565C0',
    title: 'Medical O₂ cylinder supply',
    description:
      'Medical-grade oxygen cylinders supplied with valid certification, available around the clock for clinics and home care.',
    category: 'refill',
    gasTypes: ['medical'],
    sizes: ['Medical O₂'],
    location: '22 Adeola Odeku St, Victoria Island',
    state: 'Lagos',
    city: 'Victoria Island',
    price: 28000,
    rating: 4.9,
    reviews: 87,
    isOpen: true,
    hours: '24 hrs',
    featured: true,
    verified: true
  },
  {
    id: 'l5',
    vendor: 'ProMed Gases',
    initials: 'PM',
    color: '#1565C0',
    title: 'Industrial argon & CO₂ refill',
    description:
      'Argon, CO₂, and nitrogen refills for welding shops and industrial users, with purity certificates on every order.',
    category: 'refill',
    gasTypes: ['medical', 'industrial'],
    sizes: ['Argon', 'CO₂', 'N₂'],
    location: '3 Broad St, Lagos Marina',
    state: 'Lagos',
    city: 'Lagos Marina',
    price: 35000,
    rating: 4.7,
    reviews: 64,
    isOpen: true,
    hours: '8am – 6pm',
    verified: true
  },
  {
    id: 'l6',
    vendor: 'Industrial Gas Co.',
    initials: 'IG',
    color: '#D14700',
    title: 'Bulk tank LPG supply (100 kg+)',
    description:
      'Scheduled bulk LPG deliveries for estates, hotels, and factories with on-site tank filling from Apapa.',
    category: 'refill',
    gasTypes: ['industrial', 'bulk'],
    sizes: ['50 kg', '100 kg', 'Bulk Tank'],
    location: '11 Creek Rd, Apapa',
    state: 'Lagos',
    city: 'Apapa',
    price: 92000,
    rating: 4.6,
    reviews: 41,
    isOpen: false,
    hours: 'Opens 6am',
    verified: true
  },
  {
    id: 'l7',
    vendor: 'Ardova Gas Ltd',
    initials: 'AG',
    color: '#2D7450',
    title: 'New 12.5 kg cylinder (with valve)',
    description:
      'Brand-new 12.5 kg LPG cylinder with a factory-fitted valve and safety seal. Comes empty — add a refill to have it delivered filled.',
    category: 'cylinder',
    gasTypes: ['cooking'],
    sizes: ['12.5 kg'],
    location: '14 Admiralty Way, Lekki Phase 1',
    state: 'Lagos',
    city: 'Lekki',
    price: 38500,
    rating: 4.8,
    reviews: 52,
    isOpen: true,
    hours: '7am – 9pm',
    deliveryToday: true,
    verified: true
  },
  {
    id: 'l8',
    vendor: 'HomeGas Express',
    initials: 'HG',
    color: '#2D7450',
    title: 'New 6 kg cylinder',
    description:
      'Fresh 6 kg LPG cylinder, perfect for new customers or replacing a lost one. Includes first-time activation support.',
    category: 'cylinder',
    gasTypes: ['cooking'],
    sizes: ['6 kg'],
    location: '18 Bode Thomas St, Surulere',
    state: 'Lagos',
    city: 'Surulere',
    price: 22000,
    rating: 4.3,
    reviews: 21,
    isOpen: true,
    hours: '8am – 7pm',
    verified: true
  },
  {
    // The only sellable 4FG Monitor listing on the marketplace. Everyone else
    // who carries the device is an authorized dealer (enquiries only).
    id: 'l9',
    vendor: MANUFACTURER,
    initials: '4F',
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
  },
  {
    id: 'l10',
    vendor: 'Total Gas Depot',
    initials: 'TG',
    color: '#D14700',
    title: 'Gas regulator & safety accessories',
    description:
      'High-quality regulators, valves, fittings, and safety clips. Certified for cooking and industrial use.',
    category: 'accessories',
    gasTypes: ['cooking', 'industrial'],
    sizes: ['Universal'],
    location: '5 Kingsway Rd, Ikoyi',
    state: 'Lagos',
    city: 'Ikoyi',
    price: 8500,
    rating: 4.6,
    reviews: 34,
    isOpen: true,
    hours: '6am – 8pm',
    verified: true
  },
  {
    id: 'l11',
    vendor: 'ProMed Gases',
    initials: 'PM',
    color: '#1565C0',
    title: 'Cylinder test & certification',
    description:
      'Annual cylinder safety testing and certification by qualified technicians. Valid for 12 months.',
    category: 'accessories',
    gasTypes: ['cooking', 'industrial'],
    sizes: ['All sizes'],
    location: '3 Broad St, Lagos Marina',
    state: 'Lagos',
    city: 'Lagos Marina',
    price: 5000,
    rating: 4.8,
    reviews: 47,
    isOpen: true,
    hours: '8am – 6pm',
    verified: true
  },
  {
    id: 'l12',
    vendor: 'HomeGas Express',
    initials: 'HG',
    color: '#2D7450',
    title: 'Delivery-only: Same-day gas service',
    description:
      'Last-minute refill? We deliver within 2 hours in Surulere and surrounding areas. Payment on delivery accepted.',
    category: 'refill',
    gasTypes: ['cooking'],
    sizes: ['6 kg', '12.5 kg'],
    location: '18 Bode Thomas St, Surulere',
    state: 'Lagos',
    city: 'Surulere',
    price: 6500,
    rating: 4.4,
    reviews: 112,
    isOpen: true,
    hours: '7am – 10pm',
    deliveryToday: true,
    verified: true
  },

  /* ---------------------------------------------------------------------- */
  /* Authorized 4FG Monitor dealers. Contact details only — dealers demo and  */
  /* support the device, orders go through 4First Technologies Limited.       */
  /* ---------------------------------------------------------------------- */
  {
    id: 'd1',
    vendor: 'Ardova Gas Ltd',
    initials: 'AG',
    color: '#2D7450',
    title: '4FG Monitor — authorized dealer (Lagos)',
    description:
      'Authorized dealer for Lagos Island. Buy a 4FG Monitor over the counter, have it fitted to your cylinder, and get after-sales support locally.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: '14 Admiralty Way, Lekki Phase 1',
    lat: 6.4413,
    lng: 3.4709,
    state: 'Lagos',
    city: 'Lekki',
    sellerRole: 'dealer',
    contact: { phone: '+234 801 234 5678', email: 'lekki@ardovagas.example' },
    rating: 4.8,
    reviews: 41,
    isOpen: true,
    hours: '7am – 9pm',
    verified: true
  },
  {
    id: 'd2',
    vendor: 'HomeGas Express',
    initials: 'HG',
    color: '#2D7450',
    title: '4FG Monitor — authorized dealer (Surulere)',
    description:
      'Authorized dealer for mainland Lagos. Units in stock for walk-in purchase, with installation help and warranty support.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: '18 Bode Thomas St, Surulere',
    lat: 6.4966,
    lng: 3.3515,
    state: 'Lagos',
    city: 'Surulere',
    sellerRole: 'dealer',
    contact: { phone: '+234 802 345 6789' },
    rating: 4.4,
    reviews: 28,
    isOpen: true,
    hours: '8am – 7pm',
    verified: true
  },
  {
    id: 'd3',
    vendor: 'Niger Delta Gas Services',
    initials: 'ND',
    color: '#1565C0',
    title: '4FG Monitor — authorized dealer (Port Harcourt)',
    description:
      'Authorized dealer for Rivers State. Retails the 4FG Monitor with fitting, warranty claims and on-site support.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: '7 Aba Road, Port Harcourt',
    lat: 4.8156,
    lng: 7.0134,
    state: 'Rivers',
    city: 'Port Harcourt',
    sellerRole: 'dealer',
    contact: { phone: '+234 803 456 7890', email: 'ph@ndgas.example' },
    rating: 4.6,
    reviews: 19,
    isOpen: true,
    hours: '8am – 6pm',
    verified: true
  },
  {
    id: 'd4',
    vendor: 'Capital Gas Partners',
    initials: 'CG',
    color: '#D14700',
    title: '4FG Monitor — authorized dealer (Abuja)',
    description:
      'Authorized dealer covering Abuja and the surrounding districts. Units available in store, plus fitting and support for installed monitors.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: '12 Aminu Kano Crescent, Wuse II',
    lat: 9.0820,
    lng: 7.4622,
    state: 'Federal Capital Territory',
    city: 'Wuse',
    sellerRole: 'dealer',
    contact: { phone: '+234 805 678 9012', email: 'abuja@capitalgas.example' },
    rating: 4.7,
    reviews: 33,
    isOpen: true,
    hours: '8am – 6pm',
    verified: true
  },
  {
    id: 'd5',
    vendor: 'Eastern Gas Hub',
    initials: 'EG',
    color: '#2D7450',
    title: '4FG Monitor — authorized dealer (Owerri)',
    description:
      'Authorized dealer for the South-East, based in Owerri. Retails the 4FG Monitor with same-week fitting and support visits.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: '5 Wetheral Road, Owerri',
    lat: 5.4840,
    lng: 7.0351,
    state: 'Imo',
    city: 'Owerri',
    sellerRole: 'dealer',
    contact: { phone: '+234 806 789 0123' },
    rating: 4.5,
    reviews: 12,
    isOpen: true,
    hours: '8am – 6pm',
    verified: true
  }
];

export const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
