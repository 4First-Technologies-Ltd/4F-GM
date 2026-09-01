'use client';

import { useState, useEffect } from "react";
import { Send } from "lucide-react";
import { ButtonLink } from "@/components/motion/button/base";
import { PhoneMockup } from "@/components/mobile/phone-mockup";
import { TiltCard } from "@/components/motion/tilt-card";

const steps = [
  "Download and install the app on your Android phone.",
  "Create an account or sign in.",
  "Scan the QR code on your 4FG monitor to pair it.",
  "Set your reorder threshold and you're done.",
];

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function CountdownTimer() {
  const [countdown, setCountdown] = useState<Countdown>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const launchDate = new Date(Date.now() + 27 * 24 * 60 * 60 * 1000).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = launchDate - now;

      if (distance > 0) {
        setCountdown({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000),
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-8 flex gap-8">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Days</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{String(countdown.days).padStart(2, '0')}</div>
      </div>
      <div className="text-4xl font-bold text-muted-foreground">:</div>
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hours</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{String(countdown.hours).padStart(2, '0')}</div>
      </div>
      <div className="text-4xl font-bold text-muted-foreground">:</div>
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Minutes</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{String(countdown.minutes).padStart(2, '0')}</div>
      </div>
      <div className="text-4xl font-bold text-muted-foreground">:</div>
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seconds</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{String(countdown.seconds).padStart(2, '0')}</div>
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      setEmail("");
      setTimeout(() => setSubmitted(false), 3000);
    }
  };

  return (
    <main>
      {/* Hero Section - Coming Soon */}
      <section className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
                COMING SOON
              </h1>

              <CountdownTimer />

              <p className="mt-12 text-lg text-muted-foreground">
                Be notified by email as soon as we go live...
              </p>

              <form onSubmit={handleEmailSubmit} className="mt-6 flex max-w-sm gap-2">
                <input
                  type="email"
                  placeholder="Email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 rounded-lg border border-border/70 bg-card/50 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90 transition-colors"
                  aria-label="Subscribe"
                >
                  <Send size={18} />
                </button>
              </form>

              {submitted && (
                <p className="mt-3 text-sm text-primary">✓ Thanks for subscribing!</p>
              )}
            </div>

            {/* Homescreen Phone Mockup */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
              <TiltCard max={8} glare className="relative z-10">
                <PhoneMockup
                  src="/images/mobile/homescreen.jpeg"
                  alt="4FG mobile app homescreen showing real-time gas level monitoring"
                />
              </TiltCard>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
