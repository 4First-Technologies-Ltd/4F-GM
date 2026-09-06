"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { nextPreference, type ThemePreference } from "@/lib/theme";
import { SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

const LABELS: Record<ThemePreference, string> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/**
 * Cycles system → light → dark → system. The icon shows the *current*
 * preference, so `system` reads as a monitor rather than pretending to be
 * whichever theme the OS resolved to.
 */
export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const preference = useTheme((s) => s.preference);
  const ready = useTheme((s) => s.ready);
  const hydrate = useTheme((s) => s.hydrate);
  const cycle = useTheme((s) => s.cycle);
  const reduce = useReducedMotion();

  useEffect(() => hydrate(), [hydrate]);

  const Icon = ICONS[preference];
  const next = nextPreference(preference);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABELS[preference]}. Switch to ${next}.`}
      title={`${LABELS[preference]} — click for ${next}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card/70 text-muted-foreground backdrop-blur transition-colors hover:border-border hover:text-foreground",
        showLabel ? "px-4 py-3 text-sm" : "h-10 w-10 justify-center",
        className,
      )}
    >
      <span className="relative grid h-4 w-4 place-items-center">
        {/* Nothing rendered until the client knows the real preference, so SSR
            and the pre-paint script can't disagree. */}
        <AnimatePresence initial={false} mode="popLayout">
          {ready ? (
            <motion.span
              key={preference}
              initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90 }}
              transition={SPRING_SWAP}
              className="absolute inset-0 grid place-items-center"
            >
              <Icon className="h-4 w-4" />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      {showLabel ? (
        <span>{ready ? LABELS[preference] : "Theme"}</span>
      ) : null}
    </button>
  );
}
