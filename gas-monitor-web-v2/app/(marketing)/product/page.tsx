import type { Metadata } from "next";
import Link from "next/link";
import { BeatSection } from "@/components/scroll/BeatSection";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "From a sensor under the cylinder to a reorder in your pocket — the 4FG monitoring pipeline, step by step.",
};

const step =
  "max-w-lg rounded-2xl border border-border/70 bg-card/70 p-8 backdrop-blur-md";

const steps = [
  {
    k: "01",
    title: "The sensor reads weight",
    body: "A load-cell platform sits under the cylinder. An HX711 amplifier turns tiny changes in strain into a clean weight signal, sampled every few seconds.",
    level: 0.7,
    align: "start",
  },
  {
    k: "02",
    title: "The signal leaves the house",
    body: "An ESP32 pairs the reading with a device ID and sends it over Wi-Fi, falling back to GSM so a flaky router never blinds you.",
    level: 0.55,
    align: "end",
  },
  {
    k: "03",
    title: "The cloud does the math",
    body: "The backend converts weight to a percentage against the cylinder's tare and full weights, tracks the burn rate, and predicts your empty date.",
    level: 0.35,
    align: "start",
  },
  {
    k: "04",
    title: "Your phone gets the call",
    body: "You see the live level and the forecast. Cross your threshold and 4FG lines up a vendor — automatically, or on your say-so.",
    level: 0.14,
    align: "end",
  },
];

export default function ProductPage() {
  return (
    <main>
      <BeatSection
        beat={0}
        level={0.85}
        className="flex min-h-[90svh] items-end px-6 pb-24 pt-40"
      >
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
            The pipeline
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] sm:text-6xl">
            Four steps between the flame and your phone.
          </h1>
          <p className="mt-6 max-w-xl text-muted-foreground">
            Scroll to follow a single reading from the cylinder to the reorder.
          </p>
        </div>
      </BeatSection>

      {steps.map((s) => (
        <BeatSection
          key={s.k}
          beat={Number(s.k)}
          level={s.level}
          className="flex min-h-[100svh] items-center px-6"
        >
          <div
            className={`mx-auto flex w-full max-w-7xl ${
              s.align === "end" ? "justify-end" : "justify-start"
            }`}
          >
            <div className={step}>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
                {s.k}
              </p>
              <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
                {s.title}
              </h2>
              <p className="mt-4 text-muted-foreground">{s.body}</p>
            </div>
          </div>
        </BeatSection>
      ))}

      <BeatSection
        beat={5}
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
