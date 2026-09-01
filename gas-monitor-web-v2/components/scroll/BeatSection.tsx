"use client";

import { useEffect, useRef } from "react";
import { useExperience } from "@/lib/store/experience";

type Props = {
  /** Narrative beat index this section represents. */
  beat: number;
  /** Gas level the energy column should ease toward while this section is active. */
  level?: number;
  className?: string;
  children: React.ReactNode;
};

/**
 * A scroll section that pushes its `beat` / `level` into the experience store
 * whenever it crosses the middle of the viewport.
 */
export function BeatSection({ beat, level, className, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const setBeat = useExperience((s) => s.setBeat);
  const setLevel = useExperience((s) => s.setLevel);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setBeat(beat);
            if (level !== undefined) setLevel(level);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [beat, level, setBeat, setLevel]);

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
