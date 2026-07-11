export type Category = 'refill' | 'cylinder' | 'monitor' | 'accessories';
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
  area: string;
  image?: string;
  /** Full gallery for the detail page; falls back to [image] when absent. */
  gallery?: { src: string; alt: string; tone: 'dark' | 'light' }[];
  price: number;
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

export const AREAS = ['Lekki', 'Victoria Island', 'Ikoyi', 'Surulere', 'Lagos Marina', 'Apapa'];

export const SIZES = ['6 kg', '12.5 kg', '25 kg', '50 kg'];

export const DELIVERY_FEE = 1500;

export const MAX_QUANTITY = 10;

export function getListing(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

// Vendor directory kept in sync with the mobile app's order flow (app/order/(tabs)/index.tsx).
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
    area: 'Lekki',
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
    area: 'Surulere',
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
    color: '#E65100',
    title: '50 kg bulk LPG refill',
    description:
      'High-volume LPG refill for restaurants, bakeries, and commercial kitchens. Weighed and certified at the Ikoyi depot before delivery.',
    category: 'refill',
    gasTypes: ['cooking', 'bulk'],
    sizes: ['12.5 kg', '50 kg'],
    location: '5 Kingsway Rd, Ikoyi',
    area: 'Ikoyi',
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
    area: 'Victoria Island',
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
    area: 'Lagos Marina',
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
    color: '#E65100',
    title: 'Bulk tank LPG supply (100 kg+)',
    description:
      'Scheduled bulk LPG deliveries for estates, hotels, and factories with on-site tank filling from Apapa.',
    category: 'refill',
    gasTypes: ['industrial', 'bulk'],
    sizes: ['50 kg', '100 kg', 'Bulk Tank'],
    location: '11 Creek Rd, Apapa',
    area: 'Apapa',
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
    area: 'Lekki',
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
    title: 'New 6 kg cylinder (with burner)',
    description:
      'Compact 6 kg cylinder bundled with a table-top burner attachment — a complete starter kit for small kitchens.',
    category: 'cylinder',
    gasTypes: ['cooking'],
    sizes: ['6 kg'],
    location: '18 Bode Thomas St, Surulere',
    area: 'Surulere',
    price: 24000,
    rating: 4.3,
    reviews: 33,
    isOpen: true,
    hours: '8am – 7pm',
    verified: true
  },
  {
    id: 'l9',
    vendor: '4First Technologies',
    initials: '4F',
    color: '#12271D',
    title: '4FG Smart Gas Monitor sensor',
    description:
      'The 4FG Monitor is a weight-sensing IoT base plate that sits under your cylinder and streams live gas levels to the app and web dashboard. Get low-gas alerts, AI refill predictions, and one-tap reordering. Fits 6 kg to 50 kg cylinders — no pairing, no clipping, under 3 minutes to set up.',
    category: 'monitor',
    gasTypes: ['cooking'],
    sizes: ['Fits 6 – 50 kg'],
    location: 'Ships nationwide',
    area: 'Lekki',
    image: '/products/4fg-monitor-front.jpeg',
    gallery: [
      {
        src: '/products/4fg-monitor-cylinder.jpeg',
        alt: '4FG Monitor sensor base with a 12.5 kg cylinder on top, showing the live gas level display',
        tone: 'light'
      },
      {
        src: '/products/4fg-monitor-front.jpeg',
        alt: 'Front view of the 4FG Monitor IoT device showing gas level, connection, and status indicators',
        tone: 'dark'
      },
      {
        src: '/products/4fg-monitor-angles.jpeg',
        alt: 'The 4FG Monitor device shown from multiple angles',
        tone: 'dark'
      }
    ],
    price: 45000,
    rating: 4.9,
    reviews: 312,
    isOpen: true,
    hours: 'Online store',
    featured: true,
    deliveryToday: true,
    verified: true
  },
  {
    id: 'l10',
    vendor: '4First Technologies',
    initials: '4F',
    color: '#12271D',
    title: 'Regulator + hose safety kit',
    description:
      'Certified regulator, 1.5 m reinforced hose, and clamps — everything needed for a safe cylinder-to-cooker connection.',
    category: 'accessories',
    gasTypes: ['cooking'],
    sizes: ['Universal'],
    location: 'Ships nationwide',
    area: 'Lekki',
    price: 9500,
    rating: 4.7,
    reviews: 78,
    isOpen: true,
    hours: 'Online store',
    verified: true
  },
  {
    id: 'l11',
    vendor: 'Total Gas Depot',
    initials: 'TG',
    color: '#E65100',
    title: 'New 50 kg commercial cylinder',
    description:
      'Heavy-duty 50 kg cylinder for commercial kitchens, tested and certified to Nigerian safety standards.',
    category: 'cylinder',
    gasTypes: ['cooking', 'bulk'],
    sizes: ['50 kg'],
    location: '5 Kingsway Rd, Ikoyi',
    area: 'Ikoyi',
    price: 96000,
    rating: 4.5,
    reviews: 19,
    isOpen: true,
    hours: '6am – 8pm',
    verified: true
  },
  {
    id: 'l12',
    vendor: 'MedGas Nigeria',
    initials: 'MG',
    color: '#1565C0',
    title: 'Oxygen flow regulator',
    description:
      'Precision flow regulator for medical oxygen cylinders with an easy-read gauge and standard fittings.',
    category: 'accessories',
    gasTypes: ['medical'],
    sizes: ['Universal'],
    location: '22 Adeola Odeku St, Victoria Island',
    area: 'Victoria Island',
    price: 18500,
    rating: 4.8,
    reviews: 26,
    isOpen: true,
    hours: '24 hrs',
    verified: true
  }
];
