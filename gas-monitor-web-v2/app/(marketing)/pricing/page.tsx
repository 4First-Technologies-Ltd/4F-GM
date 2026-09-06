import type { Metadata } from "next";
import {
  BarChart3,
  Check,
  ClipboardList,
  Globe,
  LineChart,
  Search,
  ShoppingCart,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { BeatSection } from "@/components/scroll/BeatSection";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { ButtonLink } from "@/components/motion/button/base";
import { VendorPathModal } from "@/components/site/VendorPathModal";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Partner plans",
  description:
    "Gas business partner plans on the 4FG Digital Gas Platform. You don't pay 4FG for being listed — we earn when you earn through the marketplace.",
};

type Plan = {
  name: string;
  rate: string;
  tagline: string;
  inherits?: string;
  features: string[];
  bestFor: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Basic Plan",
    rate: "5%",
    tagline:
      "Built for businesses that want to get online and become discoverable.",
    features: [
      "Business profile on the 4FG marketplace",
      "Business name, location, contact details and operating information",
      "Display available gas products and services",
      "Customers can discover your business through the platform",
      "Receive customer refill/order requests",
      "Basic order notifications",
      "Access to the 4FG customer network",
      "Basic sales/order history",
      "Standard customer support",
    ],
    bestFor:
      "Small and growing gas retailers, distributors and gas businesses looking to establish a digital presence.",
  },
  {
    name: "Growth Plan",
    rate: "7%",
    tagline:
      "Built for businesses ready to reach more customers and grow their sales.",
    inherits: "Everything in the 5% plan, plus:",
    features: [
      "Higher marketplace visibility",
      "Priority placement in relevant customer searches",
      "Enhanced business profile",
      "Product and service catalogue",
      "Receive and manage customer orders through the platform",
      "Sales and order analytics",
      "Customer demand insights",
      "Performance tracking",
      "Refill/order management tools",
      "Promotional opportunities on the 4FG platform",
      "Access to participating logistics providers",
      "Priority customer support",
      "Business performance reports",
    ],
    bestFor:
      "Gas stations, retailers, distributors and growing gas businesses looking to increase customer reach and sales.",
    featured: true,
  },
  {
    name: "Pro / Premium Plan",
    rate: "10%",
    tagline:
      "Built for established gas businesses looking for maximum visibility, data and growth.",
    inherits: "Everything in the 7% plan, plus:",
    features: [
      "Maximum marketplace visibility",
      "Featured business placement",
      "Priority positioning for relevant customer searches",
      "Advanced business profile and branding",
      "Advanced sales and order analytics",
      "Customer demand and purchasing insights",
      "Business performance dashboard",
      "Advanced reporting",
      "Promotional and campaign opportunities",
      "Featured product/service listings",
      "Priority access to new platform features",
      "Dedicated business support",
      "Priority onboarding for additional locations",
      "Multi-location and multi-branch management",
      "Early access to selected 4FG business tools and features",
      "API integration",
      "Advanced demand forecasting",
      "Automated inventory alerts",
    ],
    bestFor:
      "Established gas stations, gas plants, distributors, major retailers and businesses operating across multiple locations.",
  },
];

const commissionExample = [
  { plan: "5% Plan", commission: "₦5,000" },
  { plan: "7% Plan", commission: "₦7,000" },
  { plan: "10% Plan", commission: "₦10,000" },
];

const reasons = [
  {
    icon: Search,
    title: "Get discovered",
    body: "Put your gas business in front of customers actively searching for gas products and services in their area.",
  },
  {
    icon: ShoppingCart,
    title: "Get more orders",
    body: "Receive customer requests and orders directly through the 4FG digital ecosystem.",
  },
  {
    icon: BarChart3,
    title: "Understand your sales",
    body: "Use digital insights and analytics to better understand orders, demand and business performance.",
  },
  {
    icon: Truck,
    title: "Connect to logistics",
    body: "Orders can be fulfilled through participating logistics providers within the 4FG ecosystem.",
  },
  {
    icon: Globe,
    title: "Go digital",
    body: "Give your business a professional digital storefront without having to build and maintain your own marketplace.",
  },
  {
    icon: Users,
    title: "Grow with the ecosystem",
    body: "As more customers, gas businesses and logistics providers join 4FG, your business gains access to a growing connected marketplace.",
  },
];

const steps = [
  {
    k: "01",
    icon: Store,
    title: "Register",
    body: "Create your business profile and select your preferred partner plan.",
  },
  {
    k: "02",
    icon: ClipboardList,
    title: "List",
    body: "Add your gas products, services, locations and operating information.",
  },
  {
    k: "03",
    icon: Search,
    title: "Get discovered",
    body: "Customers find your business through the 4FG marketplace.",
  },
  {
    k: "04",
    icon: ShoppingCart,
    title: "Receive orders",
    body: "Customers can request or order available products and services.",
  },
  {
    k: "05",
    icon: Truck,
    title: "Fulfill",
    body: "Prepare the order for pickup or delivery through participating logistics providers.",
  },
  {
    k: "06",
    icon: LineChart,
    title: "Get paid & grow",
    body: "Receive payment, less applicable platform and transaction charges. Track performance, understand demand and grow your customer base.",
  },
];

const card =
  "rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur-md";

export default function PricingPage() {
  return (
    <main>
      {/* Hero */}
      <BeatSection beat={0} level={0.85} className="px-6 pb-16 pt-40">
        <div className="mx-auto w-full max-w-4xl text-center">
          <AnimatedBadge
            status="success"
            size="md"
            icon={<Store className="h-3.5 w-3.5" />}
          >
            4FG Digital Gas Platform
          </AnimatedBadge>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.06] sm:text-6xl">
            Gas business partner plans.
          </h1>

          <p className="mt-6 text-balance text-lg text-muted-foreground sm:text-xl">
            Grow your gas business. Reach more customers. Sell smarter.
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
            The 4FG Digital Gas Platform connects gas businesses with customers
            looking for gas products and services. By joining the marketplace,
            gas businesses gain digital visibility, access to new customers,
            tools to manage their marketplace presence, and insights that can
            help them grow.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <VendorPathModal label="Join the marketplace" />
            <ButtonLink href="/contact" variant="outline" size="lg">
              Talk to us first
            </ButtonLink>
          </div>
        </div>
      </BeatSection>

      {/* Plans */}
      <BeatSection beat={1} level={0.6} className="px-6 py-12">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-center font-mono text-xs uppercase tracking-[0.28em] text-primary">
            Marketplace / partner plans
          </p>
          <h2 className="mt-4 text-center text-3xl font-semibold sm:text-4xl">
            Choose the plan that best fits your business.
          </h2>

          <div className="mt-14 grid items-start gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border bg-card/70 p-8 backdrop-blur-md",
                  plan.featured
                    ? "border-primary/60 shadow-xl lg:-mt-6"
                    : "border-border/70",
                )}
              >
                {plan.featured ? (
                  <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground">
                    Most popular
                  </span>
                ) : null}

                <h3 className="text-lg font-semibold">{plan.name}</h3>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono text-5xl font-semibold text-primary">
                    {plan.rate}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    commission per completed order
                  </span>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  {plan.tagline}
                </p>

                <div className="mt-6 border-t border-border/70 pt-6">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
                    {plan.inherits ?? "Platform benefits"}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto pt-8">
                  <p className="rounded-xl bg-primary/[0.06] p-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Best for:{" "}
                    </span>
                    {plan.bestFor}
                  </p>
                  <ButtonLink
                    href="/sign-up"
                    size="lg"
                    variant={plan.featured ? "primary" : "outline"}
                    className="mt-4 w-full"
                  >
                    Get started on {plan.rate}
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        </div>
      </BeatSection>

      {/* Commission explainer */}
      <BeatSection beat={2} level={0.5} className="px-6 py-20">
        <div className="mx-auto grid w-full max-w-7xl items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
              The commission
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              What is the 4FG platform commission?
            </h2>
            <p className="mt-6 text-muted-foreground">
              The 4FG platform commission is a percentage charged on a
              successfully completed transaction made through the 4FG Digital
              Gas Marketplace.
            </p>
            <p className="mt-4 text-muted-foreground">
              The remaining amount belongs to the gas business, subject to any
              applicable delivery charges, taxes, payment-processing charges,
              refunds or other agreed marketplace terms.
            </p>
            <p className="mt-4 text-muted-foreground">
              No commission is charged on transactions that do not take place
              through the 4FG marketplace.
            </p>

            <blockquote className="mt-8 rounded-2xl border border-primary/40 bg-primary/[0.06] p-6 text-lg font-medium">
              &ldquo;You don&apos;t pay 4FG for simply being listed. We earn
              when you earn through the marketplace.&rdquo;
            </blockquote>
          </div>

          <div className={cn(card, "p-8")}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              For example
            </p>
            <div className="mt-4 flex items-baseline justify-between border-b border-border/70 pb-4">
              <span className="text-sm text-muted-foreground">
                Customer order
              </span>
              <span className="font-mono text-3xl font-semibold">
                &#8358;100,000
              </span>
            </div>

            <dl className="divide-y divide-border/70">
              {commissionExample.map((row) => (
                <div
                  key={row.plan}
                  className="flex items-center justify-between py-4"
                >
                  <dt className="text-sm">{row.plan}</dt>
                  <dd className="text-right">
                    <span className="font-mono text-lg font-semibold text-primary">
                      {row.commission}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      platform commission
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-xs text-muted-foreground">
              Figures are illustrative. Delivery charges, taxes, payment
              processing and refunds are applied separately under the
              marketplace terms.
            </p>
          </div>
        </div>
      </BeatSection>

      {/* Why join */}
      <BeatSection beat={3} level={0.55} className="px-6 py-20">
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
            Why join the 4FG marketplace?
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">
            How your business benefits.
          </h2>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reasons.map((r) => (
              <div key={r.title} className={card}>
                <r.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </BeatSection>

      {/* How it works */}
      <BeatSection beat={4} level={0.7} className="px-6 py-20">
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold sm:text-4xl">
            Register &rarr; List &rarr; Get discovered &rarr; Receive order
            &rarr; Fulfill &rarr; Get paid.
          </h2>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <div key={s.k} className={card}>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
                    {s.k}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </BeatSection>

      {/* CTA */}
      <BeatSection
        beat={5}
        level={0.9}
        className="flex min-h-[70svh] items-center px-6 py-20"
      >
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold sm:text-5xl">
            Join the 4FG Digital Gas Marketplace.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Take your gas business digital. Connect with customers. Grow with
            4FG.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <VendorPathModal label="Apply to sell" />
            <ButtonLink href="/contact" variant="outline" size="lg">
              Contact the team
            </ButtonLink>
          </div>

          <p className="mt-14 font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Connecting gas businesses, customers &amp; logistics
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            4First Technologies Limited &mdash; Smarter Tech, Safer World.
          </p>
        </div>
      </BeatSection>
    </main>
  );
}
