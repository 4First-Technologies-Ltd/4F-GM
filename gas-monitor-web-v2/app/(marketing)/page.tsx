import Link from "next/link";
import {
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Gauge,
  PlugZap,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Truck,
  X,
} from "lucide-react";
import Image from "next/image";
import { BeatSection } from "@/components/scroll/BeatSection";
import { TiltCard } from "@/components/motion/tilt-card";
import { PhoneMockup } from "@/components/mobile/phone-mockup";

const section =
  "px-6 py-20 sm:py-28";

const sectionInner =
  "mx-auto w-full max-w-7xl";

const sectionEyebrow =
  "font-mono text-xs uppercase tracking-[0.24em] text-primary";

const capabilities = [
  {
    title: "Real-time gas level",
    text: "See your cylinder percentage and estimated kilograms from your phone or web dashboard.",
    icon: Gauge,
  },
  {
    title: "Low-gas alerts",
    text: "Get notified before the level becomes a kitchen emergency, with thresholds you can set yourself.",
    icon: Bell,
  },
  {
    title: "Usage analytics",
    text: "Track daily consumption, understand refill patterns, and plan around how your home actually cooks.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Accurate weight sensing",
    text: "The base measures cylinder weight continuously, so you are not relying on knocks, shakes, or guesswork.",
    icon: Scale,
  },
  {
    title: "Mobile access anywhere",
    text: "Check your cylinder while you are at work, at the market, or away from the house.",
    icon: Smartphone,
  },
  {
    title: "Verified refill network",
    text: "Order from approved vendors with transparent prices, delivery tracking, and in-app payment.",
    icon: ShoppingBag,
  },
];

const steps = [
  {
    title: "Place the cylinder on the base",
    text: "No clipping onto valves and no complicated cylinder modification. The sensor sits underneath and reads weight.",
    icon: Scale,
  },
  {
    title: "Connect your account",
    text: "Your monitor syncs to 4FG so your household, facility, or restaurant can see the same live reading.",
    icon: PlugZap,
  },
  {
    title: "Get alerts and refill",
    text: "When gas drops below your chosen level, 4FG alerts you and helps you reorder from a nearby vendor.",
    icon: Truck,
  },
];

const comparisonRows = [
  {
    feature: "Real-time level tracking",
    oldWay: "Only when someone checks it",
    fourFg: "Live percentage updated automatically",
  },
  {
    feature: "Refill planning",
    oldWay: "Based on memory or last-minute panic",
    fourFg: "Forecasts from your actual usage pattern",
  },
  {
    feature: "Low-gas warning",
    oldWay: "Usually after the flame goes out",
    fourFg: "Push alerts before you run empty",
  },
  {
    feature: "Ordering",
    oldWay: "Call around and ask for prices",
    fourFg: "Order from vetted vendors in one flow",
  },
];

const faqs = [
  {
    question: "Does it work with my existing cylinder?",
    answer:
      "Yes. 4FG is designed to sit under common LPG cylinders, so you do not need to replace the cylinder or modify the valve.",
  },
  {
    question: "Is it more accurate than shaking the cylinder?",
    answer:
      "Yes. Shaking only gives a rough feel. 4FG measures weight through the base and turns that into a live level you can read clearly.",
  },
  {
    question: "Can I choose when refill alerts happen?",
    answer:
      "Yes. You can set the low-gas threshold that makes sense for your home or business, then adjust it as your routine changes.",
  },
  {
    question: "Do I have to approve automatic orders?",
    answer:
      "You can choose. 4FG can ask before placing a refill order, or it can reorder automatically when your level crosses the threshold.",
  },
  {
    question: "What if a vendor is late?",
    answer:
      "Orders are handled through the marketplace flow, so vendor status, delivery tracking, and support stay connected to the refill.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <BeatSection
        beat={0}
        level={0.62}
        className="flex min-h-[100svh] items-center px-6 py-28"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
              4FG Smart Gas Monitor
            </p>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] sm:text-6xl md:text-7xl">
              See your gas level before it runs out.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
              A sensor under the cylinder, a live reading on your phone, and an
              automatic reorder the moment you get low. No more cooking in the
              dark.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]"
              >
                Start monitoring
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/product"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 text-sm font-medium backdrop-blur hover:bg-card"
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative mx-auto flex justify-center">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
            <TiltCard max={8} glare className="relative z-10">
              <Image
                src="/images/products/4fg-monitor-cylinder.png"
                alt="4FG Smart Gas Monitor cylinder with built-in weight sensor"
                width={400}
                height={500}
                priority
                unoptimized
                className="object-contain"
              />
            </TiltCard>
          </div>
        </div>
      </BeatSection>

      {/* Core capabilities */}
      <section id="capabilities" className={section}>
        <div className={sectionInner}>
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="max-w-xl">
                <p className={sectionEyebrow}>Core capabilities</p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
                  Everything you need to stop guessing.
                </h2>
                <p className="mt-5 text-lg text-muted-foreground">
                  4FG combines accurate cylinder measurement, timely alerts, and
                  refill ordering in one connected gas experience.
                </p>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {capabilities.map((item) => {
                  const Icon = item.icon;

                  return (
                    <article
                      key={item.title}
                      className="rounded-xl border border-border/70 bg-card/75 p-6 backdrop-blur-md transition-transform hover:-translate-y-1"
                    >
                      <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon size={22} aria-hidden="true" />
                      </div>
                      <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {item.text}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
                <TiltCard max={8} glare className="relative z-10">
                  <PhoneMockup
                    src="/images/mobile/homescreen.jpeg"
                    alt="Homescreen showing gas cylinder monitoring and alerts"
                  />
                </TiltCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className={section}>
        <div className={sectionInner}>
          <div className="grid gap-10 lg:grid-cols-[1fr_0.78fr] lg:items-start">
            <div className="order-2 grid gap-4 lg:order-1">
              {steps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <article
                    key={step.title}
                    className="grid gap-5 rounded-xl border border-border/70 bg-card/75 p-6 backdrop-blur-md sm:grid-cols-[auto_1fr]"
                  >
                    <div className="flex items-center gap-3 sm:block">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/12 text-accent">
                        <Icon size={20} aria-hidden="true" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {step.text}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="order-1 max-w-xl lg:order-2 lg:ml-auto">
              <p className={sectionEyebrow}>How it works</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
                From cylinder to refill in three quiet steps.
              </h2>
              <p className="mt-5 text-lg text-muted-foreground">
                The monitor handles the measuring. The app handles the timing.
                The marketplace handles the refill.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why not check the cylinder */}
      <section id="why-not-check" className={section}>
        <div className={sectionInner}>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
              <TiltCard max={8} glare className="relative z-10">
                <PhoneMockup
                  src="/images/mobile/analytics.png"
                  alt="Usage analytics showing daily consumption and refill patterns"
                />
              </TiltCard>
            </div>

            <div className="max-w-xl">
              <p className={sectionEyebrow}>Why not check the cylinder?</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
                Because checking is still guessing.
              </h2>
              <p className="mt-5 text-lg text-muted-foreground">
                Lifting, knocking, and shaking only tell you something is low
                when it already feels low. 4FG gives you a number before the
                problem reaches the stove.
              </p>

              <div className="mt-8 overflow-hidden rounded-xl border border-border/70 bg-card/75 backdrop-blur-md">
                <div className="grid grid-cols-[1fr_0.85fr_0.95fr] border-b border-border/70 bg-secondary/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Need</span>
                  <span>Manual check</span>
                  <span>4FG Monitor</span>
                </div>
                <div className="divide-y divide-border/70">
                  {comparisonRows.map((row) => (
                    <div
                      key={row.feature}
                      className="grid grid-cols-1 gap-3 px-4 py-5 text-sm sm:grid-cols-[1fr_0.85fr_0.95fr]"
                    >
                      <div className="font-medium text-foreground">
                        {row.feature}
                      </div>
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <X
                          size={17}
                          className="mt-0.5 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                        <span>{row.oldWay}</span>
                      </div>
                      <div className="flex items-start gap-2 text-foreground">
                        <Check
                          size={17}
                          className="mt-0.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{row.fourFg}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={section}>
        <div
          className={`${sectionInner} grid gap-10 lg:grid-cols-[1.08fr_0.82fr] lg:items-start`}
        >
          <div className="order-2 space-y-3 lg:order-1">
            {faqs.map((item) => (
              <details
                key={item.question}
                className="group rounded-xl border border-border/70 bg-card/75 p-5 backdrop-blur-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left font-semibold">
                  <span>{item.question}</span>
                  <ChevronDown
                    size={18}
                    className="shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>

          <div className="order-1 max-w-xl lg:order-2 lg:ml-auto">
            <p className={sectionEyebrow}>Frequently asked questions</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              What people usually ask before installing.
            </h2>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <ShieldCheck size={16} aria-hidden="true" />
              Built for everyday LPG use
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <BeatSection
        beat={4}
        level={0.62}
        className="flex min-h-[80svh] items-center px-6"
      >
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-3xl font-semibold sm:text-5xl">
            Never run out again.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Order a monitor, plug it in, and forget about it.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]"
          >
            Get started
            <ArrowRight size={16} />
          </Link>
        </div>
      </BeatSection>
    </main>
  );
}
