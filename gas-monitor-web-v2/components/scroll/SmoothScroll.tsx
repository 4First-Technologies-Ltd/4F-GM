"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { useExperience } from "@/lib/store/experience";
import { usePrefersReducedMotion } from "@/lib/hooks/use-media-query";

/**
 * Wraps the app in a Lenis smooth-scroll context and publishes normalized
 * scroll progress to the experience store on every frame. When the user
 * prefers reduced motion, Lenis is not started and native scroll is used;
 * progress is still tracked via a scroll listener.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const setScroll = useExperience((s) => s.setScroll);
  const reducedMotion = usePrefersReducedMotion();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const publish = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setScroll(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };

    if (reducedMotion) {
      publish();
      window.addEventListener("scroll", publish, { passive: true });
      window.addEventListener("resize", publish);
      return () => {
        window.removeEventListener("scroll", publish);
        window.removeEventListener("resize", publish);
      };
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.5,
    });

    const raf = (time: number) => {
      lenis.raf(time);
      publish();
      rafRef.current = requestAnimationFrame(raf);
    };
    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
    };
  }, [reducedMotion, setScroll]);

  return <>{children}</>;
}
