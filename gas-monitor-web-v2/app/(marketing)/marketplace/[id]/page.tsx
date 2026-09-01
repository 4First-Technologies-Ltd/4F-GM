import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { ButtonLink } from "@/components/motion/button/base";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { LISTINGS, getListing, NGN } from "@/lib/catalog";

export function generateStaticParams() {
  return LISTINGS.map((l) => ({ id: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = getListing(id);
  return {
    title: listing ? `${listing.title} — ${listing.vendor}` : "Listing",
    description: listing?.blurb,
  };
}

const AVAILABILITY = {
  "in-stock": { label: "In stock", status: "success" as const },
  "low-stock": { label: "Low stock", status: "warning" as const },
  preorder: { label: "Pre-order", status: "info" as const },
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) notFound();

  const a = AVAILABILITY[listing.availability];

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <Link
        href="/marketplace"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to marketplace
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <AnimatedBadge status={a.status} size="sm">
              {a.label}
            </AnimatedBadge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star size={12} className="fill-current" />
              {listing.rating.toFixed(1)} rating
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-semibold">{listing.title}</h1>
          <p className="mt-2 text-muted-foreground">
            Sold by {listing.vendor} · {listing.region}
          </p>
          <p className="mt-6 max-w-prose text-muted-foreground">
            {listing.blurb}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <dt className="text-muted-foreground">Cylinder size</dt>
              <dd className="mt-1 font-mono text-lg">{listing.sizeKg} kg</dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <dt className="text-muted-foreground">Region</dt>
              <dd className="mt-1 text-lg">{listing.region}</dd>
            </div>
          </dl>
        </div>

        <aside className="h-fit rounded-2xl border border-border/70 bg-card/80 p-6 backdrop-blur">
          <p className="text-sm text-muted-foreground">Price</p>
          <p className="mt-1 font-mono text-3xl font-semibold">
            {NGN.format(listing.priceNgn)}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <ButtonLink href={`/checkout?listing=${listing.id}`} size="lg">
              Order now
            </ButtonLink>
            <ButtonLink href="/sign-in" variant="outline" size="lg">
              Sign in to save
            </ButtonLink>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Payment is held until the delivery is confirmed in the app.
          </p>
        </aside>
      </div>
    </main>
  );
}
