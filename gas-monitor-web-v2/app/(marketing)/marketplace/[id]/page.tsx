import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, MapPin, Check } from "lucide-react";
import { ButtonLink } from "@/components/motion/button/base";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { LISTINGS, getListing, CATEGORY_LABEL } from "@/lib/catalog";
import { formatNaira } from "@/lib/format";

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
    description: listing?.description,
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) notFound();

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
          <div className="flex items-start gap-3">
            <AnimatedBadge status={listing.isOpen ? "success" : "info"} size="sm">
              {listing.isOpen ? "Open now" : listing.hours}
            </AnimatedBadge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star size={12} className="fill-current" />
              {listing.rating.toFixed(1)} · {listing.reviews} reviews
            </span>
          </div>

          <h1 className="mt-4 text-4xl font-semibold">{listing.title}</h1>

          <div className="mt-4 flex items-center gap-2">
            <div
              className="grid h-10 w-10 place-items-center rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: listing.color }}
            >
              {listing.initials}
            </div>
            <div>
              <p className="font-medium">
                {listing.vendor}
                {listing.verified && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600">
                    <Check size={12} /> Verified
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin size={14} /> {listing.location}
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-prose text-muted-foreground">
            {listing.description}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="mt-1 text-lg font-medium">{CATEGORY_LABEL[listing.category]}</dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <dt className="text-muted-foreground">Available sizes</dt>
              <dd className="mt-1 text-lg font-medium">{listing.sizes.join(", ")}</dd>
            </div>
          </dl>
        </div>

        <aside className="h-fit rounded-2xl border border-border/70 bg-card/80 p-6 backdrop-blur">
          <p className="text-sm text-muted-foreground">Price</p>
          <p className="mt-1 font-mono text-3xl font-semibold">
            {formatNaira(listing.price)}
          </p>
          {listing.deliveryToday && (
            <p className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary w-fit">
              Same-day delivery available
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <ButtonLink href={`/marketplace/${listing.id}`} size="lg">
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
