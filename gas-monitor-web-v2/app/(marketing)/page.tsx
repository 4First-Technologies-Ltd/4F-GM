import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BeatSection } from "@/components/scroll/BeatSection";

const panel =
  "max-w-xl rounded-2xl border border-border/70 bg-card/70 p-8 backdrop-blur-md shadow-[0_20px_50px_-20px_rgba(18,39,29,0.35)]";

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <BeatSection
        beat={0}
        level={0.62}
        className="flex min-h-[100svh] items-center px-6"
      >
        <div className="mx-auto w-full max-w-7xl">
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
      </BeatSection>

      {/* Beat 1 — live measurement */}
      <BeatSection
        beat={1}
        level={0.62}
        className="flex min-h-[100svh] items-center px-6"
      >
        <div className="mx-auto flex w-full max-w-7xl justify-start">
          <div className={panel}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              01 — Measure
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Live level, to the gram
            </h2>
            <p className="mt-4 text-muted-foreground">
              Four load cells under the base weigh the cylinder continuously.
              The app shows a real percentage, not a guess from a knock or a
              shake.
            </p>
          </div>
        </div>
      </BeatSection>

      {/* Beat 2 — auto reorder */}
      <BeatSection
        beat={2}
        level={0.16}
        className="flex min-h-[100svh] items-center px-6"
      >
        <div className="mx-auto flex w-full max-w-7xl justify-end">
          <div className={panel}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              02 — Reorder
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              We reorder before you&apos;re empty
            </h2>
            <p className="mt-4 text-muted-foreground">
              Set a threshold once. When the level crosses it, 4FG places an
              order with a nearby vendor automatically — or asks first, if you
              prefer.
            </p>
          </div>
        </div>
      </BeatSection>

      {/* Beat 3 — marketplace */}
      <BeatSection
        beat={3}
        level={0.9}
        className="flex min-h-[100svh] items-center px-6"
      >
        <div className="mx-auto flex w-full max-w-7xl justify-start">
          <div className={panel}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              03 — Refill
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Vetted vendors, transparent prices
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every vendor on the marketplace is approved by 4FG. Compare
              prices, track the delivery, pay in the app.
            </p>
          </div>
        </div>
      </BeatSection>

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
