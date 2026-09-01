"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useExperience } from "@/lib/store/experience";
import { useQualityTier } from "@/lib/hooks/use-quality-tier";
import { PosterFallback } from "@/components/three/PosterFallback";

const Scene = dynamic(
  () => import("@/components/three/Scene").then((m) => m.Scene),
  { ssr: false },
);

/**
 * Fixed, full-viewport background layer that hosts the 3D experience.
 * Resolves the quality tier, feeds pointer movement into the store, and
 * swaps to a static poster when WebGL is unavailable or motion is reduced.
 */
export function ExperienceCanvas() {
  const quality = useQualityTier();
  const setPointer = useExperience((s) => s.setPointer);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (quality === "off") return;
    const onMove = (e: PointerEvent) => {
      setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [quality, setPointer]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {mounted && quality !== "off" ? <Scene /> : <PosterFallback />}
    </div>
  );
}
