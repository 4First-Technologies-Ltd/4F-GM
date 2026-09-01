import type { Metadata } from "next";
import { ButtonLink } from "@/components/motion/button/base";

export const metadata: Metadata = {
  title: "Get the app",
  description:
    "Install the 4FG Smart Gas Monitor app for Android to see your live gas level and manage reorders.",
};

const steps = [
  "Download and install the app on your Android phone.",
  "Create an account or sign in.",
  "Scan the QR code on your 4FG monitor to pair it.",
  "Set your reorder threshold and you're done.",
];

export default function DownloadsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        Get the app
      </p>
      <h1 className="mt-4 text-balance text-4xl font-semibold sm:text-5xl">
        Your gas level, in your pocket.
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        The 4FG app pairs with your monitor, shows the live level and forecast,
        and handles reorders. Android today; iOS is in the works.
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        <ButtonLink href="/downloads/4fg-monitor.apk" size="lg">
          Download APK
        </ButtonLink>
        <ButtonLink
          href="https://play.google.com/store"
          variant="outline"
          size="lg"
          target="_blank"
          rel="noreferrer"
        >
          Google Play (soon)
        </ButtonLink>
      </div>

      <ol className="mt-16 space-y-4">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border font-mono text-sm text-primary">
              {i + 1}
            </span>
            <p className="pt-1 text-muted-foreground">{s}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
