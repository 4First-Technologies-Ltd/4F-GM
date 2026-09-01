"use client";

import { useEffect } from "react";
import { useExperience, type QualityTier } from "@/lib/store/experience";
import {
  usePrefersReducedMotion,
  useIsSmallScreen,
} from "@/lib/hooks/use-media-query";

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Resolves a rendering tier once on mount and keeps it in sync with the
 * reduced-motion preference. `off` tells the experience to show the poster.
 */
export function useQualityTier(): QualityTier {
  const quality = useExperience((s) => s.quality);
  const setQuality = useExperience((s) => s.setQuality);
  const setReducedMotion = useExperience((s) => s.setReducedMotion);
  const reducedMotion = usePrefersReducedMotion();
  const smallScreen = useIsSmallScreen();

  useEffect(() => {
    setReducedMotion(reducedMotion);

    if (reducedMotion || !detectWebGL()) {
      setQuality("off");
      return;
    }

    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;

    if (smallScreen) {
      setQuality(cores <= 4 || (memory !== undefined && memory <= 4) ? "low" : "medium");
      return;
    }

    if (cores <= 4 || (memory !== undefined && memory <= 4)) {
      setQuality("medium");
      return;
    }

    setQuality("high");
  }, [reducedMotion, smallScreen, setQuality, setReducedMotion]);

  return quality;
}
