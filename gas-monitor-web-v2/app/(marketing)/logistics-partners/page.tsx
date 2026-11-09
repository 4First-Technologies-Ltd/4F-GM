import type { Metadata } from "next";
import { ButtonLink } from "@/components/motion/button/base";

export const metadata: Metadata = {
  title: "Logistics partnerships",
  description:
    "Run a delivery fleet? Bring your riders onto 4FG, get them approved in one step, and watch every delivery from one dashboard.",
};

const points = [
  {
    title: "Bring your whole fleet",
    body: "Invite riders by email. Once they sign up and verify, they join your fleet and are ready to take deliveries.",
  },
  {
    title: "One approval, not many",
    body: "4FG approves your company once. Riders who join through you are covered by that approval, so there is no separate vetting for each one.",
  },
  {
    title: "See every delivery",
    body: "Follow your riders' deliveries with the vendor, the delivery address and the status, all in one place.",
  },
  {
    title: "Vendors do the dispatching",
    body: "Vendors, branch managers and admins assign orders to individual riders, and your company name shows next to each of your riders.",
  },
];

const steps = [
  "Create a Logistics Company account and submit your company details.",
  "4FG reviews and approves your company.",
  "Invite your riders by email. They sign up as riders with that email and verify it.",
  "Your riders become assignable to vendors' orders, and you follow their deliveries.",
];

export default function LogisticsPartnersPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        Logistics partnerships
      </p>
      <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold sm:text-6xl">
        Put your riders on the road with 4FG.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        If you run a delivery fleet, 4FG gives your riders a steady flow of gas
        refill deliveries and gives you a clear view of how they are doing.
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        <ButtonLink href="/sign-up?role=company" size="lg">
          Register your company
        </ButtonLink>
        <ButtonLink href="/sign-in?role=rider" variant="outline" size="lg">
          Rider sign in
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
        <h2 className="text-2xl font-semibold">How it works</h2>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          {steps.map((s, i) => (
            <li key={s}>
              <span className="font-mono text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>{" "}
              &nbsp; {s}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-xs text-muted-foreground">
          Company earnings and payouts, and assigning orders to a company
          directly, are not available yet. Logistics companies sign in from the
          Rider tab.
        </p>
      </div>
    </main>
  );
}
