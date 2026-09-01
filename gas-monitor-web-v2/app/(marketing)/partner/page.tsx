import type { Metadata } from "next";
import { ButtonLink } from "@/components/motion/button/base";

export const metadata: Metadata = {
  title: "For vendors",
  description:
    "List your refills on 4FG, get orders from monitored households, and get paid on confirmed delivery.",
};

const points = [
  {
    title: "Orders find you",
    body: "Monitored households cross their reorder threshold and 4FG routes the order to a nearby approved vendor. That could be you.",
  },
  {
    title: "One dashboard",
    body: "Manage listings, prices, delivery windows and payouts from the vendor dashboard. No spreadsheets, no WhatsApp threads.",
  },
  {
    title: "Paid on delivery",
    body: "Payment is captured at checkout and released to you when the customer confirms the drop. No chasing.",
  },
  {
    title: "Vetted, not crowded",
    body: "Every vendor is reviewed before going live. Customers trust the marketplace, so your listing gets seen.",
  },
];

export default function PartnerPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        For vendors
      </p>
      <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold sm:text-6xl">
        Sell refills to people who know exactly when they need one.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        4FG customers run out predictably, not suddenly. That makes them the
        best refill customers you can have.
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        <ButtonLink href="/vendor-sign-up" size="lg">
          Apply to sell
        </ButtonLink>
        <ButtonLink href="/contact" variant="outline" size="lg">
          Talk to us first
        </ButtonLink>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        {points.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur"
          >
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border border-border/70 bg-primary/5 p-8">
        <h2 className="text-2xl font-semibold">How approval works</h2>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="font-mono text-primary">01</span> &nbsp; Submit your
            business details and coverage area.
          </li>
          <li>
            <span className="font-mono text-primary">02</span> &nbsp; 4FG reviews
            your licensing and safety record.
          </li>
          <li>
            <span className="font-mono text-primary">03</span> &nbsp; You&apos;re
            approved, you add listings, orders start routing to you.
          </li>
        </ol>
      </div>
    </main>
  );
}
