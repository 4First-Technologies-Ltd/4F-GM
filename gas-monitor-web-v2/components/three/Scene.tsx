"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Preload,
  PerformanceMonitor,
} from "@react-three/drei";
import { useExperience } from "@/lib/store/experience";
import { Lighting } from "@/components/three/rig/Lighting";
import { CameraDriver } from "@/components/three/CameraDriver";
import { ParticleField } from "@/components/three/motifs/ParticleField";
import { GridFloor } from "@/components/three/motifs/GridFloor";

/**
 * The default marketing scene: a receding grid landscape with a drifting
 * particle field. Rendered behind page content; pointer events pass through
 * to the DOM.
 */
export function Scene() {
  const quality = useExperience((s) => s.quality);
  const setQuality = useExperience((s) => s.setQuality);
  const dprMax = quality === "high" ? 2 : quality === "medium" ? 1.5 : 1;

  return (
    <Canvas
      dpr={[1, dprMax]}
      camera={{ position: [0, 1.2, 8], fov: 42, near: 0.1, far: 100 }}
      gl={{
        antialias: quality === "high",
        powerPreference: "high-performance",
        alpha: true,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.setClearAlpha(0);
      }}
      style={{ pointerEvents: "none", background: "transparent" }}
    >
      <PerformanceMonitor
        onDecline={() => setQuality(quality === "high" ? "medium" : "low")}
      />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />

      <Suspense fallback={null}>
        <Lighting withEnvironment={quality !== "low"} />
        <CameraDriver />
        <ParticleField />
        <GridFloor />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
