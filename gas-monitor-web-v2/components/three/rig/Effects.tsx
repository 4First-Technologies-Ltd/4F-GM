"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useExperience } from "@/lib/store/experience";

/**
 * Postprocessing stack. Disabled entirely on the low tier to protect frame
 * rate on weak GPUs.
 */
export function Effects() {
  const quality = useExperience((s) => s.quality);
  if (quality === "low" || quality === "off") return null;

  return (
    <EffectComposer multisampling={quality === "high" ? 4 : 0}>
      <Bloom
        intensity={quality === "high" ? 0.9 : 0.5}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.15} darkness={0.75} />
    </EffectComposer>
  );
}
