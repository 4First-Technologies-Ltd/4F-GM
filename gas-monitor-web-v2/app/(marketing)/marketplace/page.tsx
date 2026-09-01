"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { TiltCard } from "@/components/motion/tilt-card";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { LISTINGS, NGN, type Listing } from "@/lib/catalog";

const REGIONS = ["All regions", ...new Set(LISTINGS.map((l) => l.region))];

const AVAILABILITY: Record<
  Listing["availability"],
  { label: string; status: "success" | "warning" | "info" }
> = {
  "in-stock": { label: "In stock", status: "success" },
  "low-stock": { label: "Low stock", status: "warning" },
  preorder: { label: "Pre-order", status: "info" },
};

export default function MarketplacePage() {
  const [region, setRegion] = useState("All regions");
  const [sort, setSort] = useState("price-asc");

  const listings = useMemo(() => {
    let rows = LISTINGS.filter(
      (l) => region === "All regions" || l.region === region,
    );
    rows = [...rows].sort((a, b) => {
      if (sort === "price-asc") return a.priceNgn - b.priceNgn;
      if (sort === "price-desc") return b.priceNgn - a.priceNgn;
      return b.rating - a.rating;
    });
    return rows;
  }, [region, sort]);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 pt-32">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        Marketplace
      </p>
      <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold sm:text-5xl">
        Refills and cylinders from vendors 4FG has vetted.
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Every price is what you pay. Track the delivery and settle up in the
        app.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <div className="w-56">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger>
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price-asc">Price: low to high</SelectItem>
              <SelectItem value="price-desc">Price: high to low</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => {
          const a = AVAILABILITY[l.availability];
          return (
            <TiltCard
              key={l.id}
              max={8}
              glare={false}
              className="border border-border/70 bg-card/80 backdrop-blur"
            >
              <Link href={`/marketplace/${l.id}`} className="block p-6">
                <div className="flex items-center justify-between">
                  <AnimatedBadge status={a.status} size="sm">
                    {a.label}
                  </AnimatedBadge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Star size={12} className="fill-current" />
                    {l.rating.toFixed(1)}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold">{l.title}</h2>
                <p className="text-sm text-muted-foreground">{l.vendor}</p>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {l.blurb}
                </p>
                <div className="mt-5 flex items-baseline justify-between">
                  <span className="font-mono text-xl font-semibold">
                    {NGN.format(l.priceNgn)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.region}
                  </span>
                </div>
              </Link>
            </TiltCard>
          );
        })}
      </div>
    </main>
  );
}
