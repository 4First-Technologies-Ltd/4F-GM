import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, MapPin, Check, Phone, Mail, Clock } from "lucide-react";
import { ButtonLink } from "@/components/motion/button/base";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  LISTINGS,
  getListing,
  CATEGORY_LABEL,
  isPurchasable,
  sellerRoleOf,
  SELLER_ROLE_LABEL,
  MANUFACTURER,
  MONITOR_LISTING_ID,
  MONITOR_MOQ,
  monitorDealers,
} from "@/lib/catalog";
import { LocationMap } from "@/components/marketplace/LocationMap";
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

          {/* Where to find a dealer in person. */}
          {sellerRoleOf(listing) === "dealer" &&
            listing.lat != null &&
            listing.lng != null && (
              <section className="mt-10">
                <h2 className="text-lg font-semibold">Find this dealer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Walk in to see the monitor, buy a unit, or have one fitted.
                </p>
                <div className="mt-4">
                  <LocationMap
                    lat={listing.lat}
                    lng={listing.lng}
                    address={[
                      listing.location,
                      listing.location.includes(listing.city) ? null : listing.city,
                      listing.state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    label={listing.vendor}
                  />
                </div>
              </section>
            )}

          {/* Retail runs through the dealer network; trade packs come direct. */}
          {listing.id === MONITOR_LISTING_ID && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Authorized dealers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prefer to buy a single unit in person? These authorized dealers
                retail the 4FG Monitor, fit it and support it. Orders of{" "}
                {MONITOR_MOQ} units or more are supplied direct by {MANUFACTURER}.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {monitorDealers().map((d) => (
                  <li
                    key={d.id}
                    className="rounded-xl border border-border/70 bg-card/60 p-4"
                  >
                    <Link
                      href={`/marketplace/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {d.vendor}
                    </Link>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={12} /> {d.city}, {d.state}
                    </p>
                    {d.contact?.phone && (
                      <a
                        href={`tel:${d.contact.phone.replace(/\s/g, "")}`}
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone size={12} /> {d.contact.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-border/70 bg-card/80 p-6 backdrop-blur">
          {isPurchasable(listing) ? (
            <>
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="mt-1 font-mono text-3xl font-semibold">
                {formatNaira(listing.price!)}
                {listing.minOrderQty ? (
                  <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                    / unit
                  </span>
                ) : null}
              </p>

              {listing.minOrderQty ? (
                <div className="mt-4 rounded-xl border border-accent/40 bg-accent/[0.08] p-4">
                  <p className="text-sm font-medium">
                    Minimum order: {listing.minOrderQty} units
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The 4FG Monitor is sold direct by {MANUFACTURER} in trade
                    packs. Total from{" "}
                    <span className="font-medium text-foreground">
                      {formatNaira(listing.price! * listing.minOrderQty)}
                    </span>
                    .
                  </p>
                </div>
              ) : null}

              {listing.deliveryToday && (
                <p className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary w-fit">
                  Same-day delivery available
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3">
                <ButtonLink
                  href={`/checkout?item=${listing.id}${
                    listing.minOrderQty ? `&qty=${listing.minOrderQty}` : ""
                  }`}
                  size="lg"
                >
                  Order now
                </ButtonLink>
                <ButtonLink href="/sign-in" variant="outline" size="lg">
                  Sign in to save
                </ButtonLink>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Payment is held until the delivery is confirmed in the app.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {SELLER_ROLE_LABEL[sellerRoleOf(listing)]}
              </p>
              <p className="mt-1 text-lg font-semibold">{listing.vendor}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                An authorized {MANUFACTURER} dealer. They retail units of the
                4FG Monitor, fit it to your cylinder and handle after-sales
                support. Contact them directly for stock, pricing and pickup.
              </p>

              <dl className="mt-6 space-y-4 border-t border-border/70 pt-6 text-sm">
                <div className="flex items-start gap-3">
                  <Phone size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Phone
                    </dt>
                    <dd>
                      <a
                        href={`tel:${listing.contact!.phone.replace(/\s/g, "")}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {listing.contact!.phone}
                      </a>
                    </dd>
                  </div>
                </div>

                {listing.contact?.email && (
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Email
                      </dt>
                      <dd className="break-words">
                        <a
                          href={`mailto:${listing.contact.email}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {listing.contact.email}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Address
                    </dt>
                    <dd>
                      {listing.location}
                      <span className="block text-muted-foreground">
                        {listing.location.includes(listing.city)
                          ? listing.state
                          : `${listing.city}, ${listing.state}`}
                      </span>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Opening hours
                    </dt>
                    <dd>{listing.hours}</dd>
                  </div>
                </div>
              </dl>

              <a
                href={`tel:${listing.contact!.phone.replace(/\s/g, "")}`}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Phone size={16} /> Call dealer
              </a>

              <p className="mt-4 text-xs text-muted-foreground">
                Buying 10 or more?{" "}
                <Link
                  href={`/marketplace/${MONITOR_LISTING_ID}`}
                  className="font-medium text-primary hover:underline"
                >
                  Order direct from {MANUFACTURER.split(" ")[0]}
                </Link>
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
