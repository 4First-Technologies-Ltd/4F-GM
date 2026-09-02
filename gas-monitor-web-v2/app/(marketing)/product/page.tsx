import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Bell, CheckCircle2, MonitorSmartphone, Star, Users, Wifi } from "lucide-react";
import { BeatSection } from "@/components/scroll/BeatSection";
import { TiltCard } from "@/components/motion/tilt-card";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { ButtonLink } from "@/components/motion/button/base";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "From your cylinder to a reorder in your pocket — the 4FG experience, step by step.",
};

const step =
  "rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur-md";

const steps = [
  {
    k: "01",
    title: "The cylinder is monitored",
    body: "The 4FG-Monitor continuously monitors the amount of gas in your cylinder and provides an accurate reading of the remaining gas level.",
  },
  {
    k: "02",
    title: "Your reading is sent to your phone",
    body: "The device securely communicates the gas level to the 4FG platform, allowing you to view your cylinder's current reading directly from your phone.",
  },
  {
    k: "03",
    title: "The platform tracks your usage",
    body: "The 4FG platform analyzes your gas level and usage over time, helping you understand your consumption and estimate when your gas may run out.",
  },
  {
    k: "04",
    title: "Get alerts when you need a refill",
    body: "When your gas level gets low, the platform can notify you so you can plan your refill before you run out.",
  },
  {
    k: "05",
    title: "Order a refill when you're ready",
    body: "Through the 4FG Digital Gas Platform, you can find participating gas suppliers, request a refill and have your order delivered through available logistics partners.",
  },
];

export default function ProductPage() {
  return (
    <main>
      <BeatSection
        beat={0}
        level={0.85}
        className="overflow-x-clip px-6 pb-28 pt-40"
      >
        <div className="mx-auto grid w-full max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-12">
          {/* Left: copy */}
          <div>
            <AnimatedBadge status="success" size="md" icon={<Users className="h-3.5 w-3.5" />}>
              Now monitoring homes across Owerri
            </AnimatedBadge>

            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.04] sm:text-7xl">
              4FG Monitor.
            </h1>

            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Track your cylinder in real time, get a heads-up before it runs
              low, and reorder from trusted vendors — all from one app.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex text-accent">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Loved by the households already testing 4FG
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/downloads" size="lg">
                Get the app — it&apos;s free
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="outline">
                See how it works
              </ButtonLink>
            </div>
          </div>

          {/* Right: hero visual */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              aria-hidden
              className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-2xl"
            />

            <TiltCard
              max={5}
              className="aspect-[16/10] w-full bg-card/70 shadow-xl"
            >
              <Image
                src="/images/products/product-hero2.png"
                alt="4FG Smart Gas Monitor fitted to a household gas cylinder"
                fill
                priority
                sizes="(min-width: 1024px) 40rem, 90vw"
                className="object-contain"
              />
            </TiltCard>

            {/* Floating: monitoring status */}
            <div className="absolute -top-5 left-4 flex items-center gap-2 rounded-full border border-border/70 bg-card/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-md sm:-left-6">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Monitoring live
            </div>

            {/* Floating: refill alert stat */}
            <div className="absolute -right-3 top-10 w-36 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur-md sm:-right-8 sm:w-40 sm:p-4">
              <div className="flex items-center gap-1.5 text-primary">
                <Bell className="h-3.5 w-3.5" />
                <span className="font-mono text-[11px] uppercase tracking-wide">
                  Alerts
                </span>
              </div>
              <p className="mt-1.5 font-mono text-2xl font-semibold sm:text-3xl">
                24/7
              </p>
              <p className="text-xs text-muted-foreground">
                Real-time gas level tracking
              </p>
            </div>

            {/* Floating: app preview card */}
            <div className="absolute -bottom-6 left-1/2 w-52 -translate-x-1/2 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-lg backdrop-blur-md sm:bottom-6 sm:left-auto sm:right-[-1.5rem] sm:w-48 sm:translate-x-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Kitchen cylinder</p>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[68%] rounded-full bg-primary" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                68% remaining · ~9 days left
              </p>
            </div>
          </div>
        </div>
      </BeatSection>

      <BeatSection beat={1} level={0.55} className="px-6 py-20">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div className="relative mx-auto w-full max-w-lg lg:order-2">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-2xl"
            />
            <TiltCard max={5} className="aspect-[3/2] w-full bg-card/70 shadow-xl">
              <Image
                src="/images/products/remote.png"
                alt="4FG wall-mounted display showing live tank status"
                fill
                sizes="(min-width: 1024px) 32rem, 90vw"
                className="object-cover"
              />
            </TiltCard>
          </div>

          <div className="lg:order-1">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              Also available
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Prefer a screen on the wall?
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Mount the 4FG display near your cylinder or kitchen for an
              at-a-glance reading — no phone required. It shows the same live
              status as the app, right where you cook.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Same live reading as your phone, always visible
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Stays in sync automatically once it&apos;s connected
                </p>
              </div>
            </div>
          </div>
        </div>
      </BeatSection>

      <BeatSection beat={2} level={0.45} className="px-6 py-16">
        <div id="how-it-works" className="mx-auto w-full max-w-7xl scroll-mt-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s) => (
              <div key={s.k} className={step}>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
                  {s.k}
                </p>
                <h2 className="mt-3 text-lg font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </BeatSection>

      <BeatSection
        beat={3}
        level={0.62}
        className="flex min-h-[70svh] items-center px-6"
      >
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="text-3xl font-semibold sm:text-5xl">
            That&apos;s the whole loop.
          </h2>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]"
          >
            Start monitoring
          </Link>
        </div>
      </BeatSection>
    </main>
  );
}
