/**
 * Placeholder marketplace catalogue. Phase 5 replaces this with a live fetch
 * from gas-monitor-backend `/cylinders` + `/vendor` listings.
 */

export type Listing = {
  id: string;
  title: string;
  vendor: string;
  region: string;
  sizeKg: number;
  priceNgn: number;
  rating: number;
  availability: "in-stock" | "low-stock" | "preorder";
  blurb: string;
};

export const LISTINGS: Listing[] = [
  {
    id: "lpg-6kg-standard",
    title: "6 kg LPG refill",
    vendor: "Ember Gas Co.",
    region: "Lagos — Mainland",
    sizeKg: 6,
    priceNgn: 6800,
    rating: 4.8,
    availability: "in-stock",
    blurb:
      "Household starter size. Same-day delivery inside Yaba, Surulere and Ebute Metta.",
  },
  {
    id: "lpg-12kg-standard",
    title: "12.5 kg LPG refill",
    vendor: "Ember Gas Co.",
    region: "Lagos — Mainland",
    sizeKg: 12.5,
    priceNgn: 13400,
    rating: 4.8,
    availability: "in-stock",
    blurb: "The default family cylinder. Free valve check on every refill.",
  },
  {
    id: "lpg-12kg-island",
    title: "12.5 kg LPG refill",
    vendor: "BlueFlame Depot",
    region: "Lagos — Island",
    sizeKg: 12.5,
    priceNgn: 13950,
    rating: 4.6,
    availability: "low-stock",
    blurb: "Lekki, Ikoyi and VI. Scheduled delivery windows, contactless drop.",
  },
  {
    id: "lpg-25kg-commercial",
    title: "25 kg commercial cylinder",
    vendor: "Kano Kitchen Supply",
    region: "Kano",
    sizeKg: 25,
    priceNgn: 27200,
    rating: 4.5,
    availability: "in-stock",
    blurb: "For canteens and bakeries. Includes regulator compatibility check.",
  },
  {
    id: "lpg-50kg-commercial",
    title: "50 kg commercial cylinder",
    vendor: "Kano Kitchen Supply",
    region: "Kano",
    sizeKg: 50,
    priceNgn: 53500,
    rating: 4.5,
    availability: "preorder",
    blurb: "Bulk catering. 48-hour lead time, delivery scheduled on confirmation.",
  },
  {
    id: "new-6kg-kit",
    title: "New 6 kg cylinder + monitor",
    vendor: "4FG Direct",
    region: "Nationwide",
    sizeKg: 6,
    priceNgn: 24500,
    rating: 4.9,
    availability: "in-stock",
    blurb:
      "A fresh cylinder, a 4FG Smart Monitor, first fill included. Ships anywhere.",
  },
];

export function getListing(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

export const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
