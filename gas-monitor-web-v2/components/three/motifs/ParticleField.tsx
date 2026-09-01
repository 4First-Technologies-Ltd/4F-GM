"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { readExperience } from "@/lib/store/experience";

/**
 * A drifting cloud of points that parallaxes against pointer and scroll.
 * Count scales with quality tier.
 */
export function ParticleField({ count }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const resolvedCount = useMemo(() => {
    if (count) return count;
    const q = readExperience().quality;
    return q === "high" ? 2600 : q === "medium" ? 1400 : 700;
  }, [count]);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(resolvedCount * 3);
    const speeds = new Float32Array(resolvedCount);
    for (let i = 0; i < resolvedCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 4;
      speeds[i] = 0.15 + Math.random() * 0.5;
    }
    return { positions, speeds };
  }, [resolvedCount]);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const { pointer, scroll, reducedMotion } = readExperience();
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const step = reducedMotion ? 0 : delta;
    for (let i = 0; i < resolvedCount; i++) {
      let y = arr[i * 3 + 1] + speeds[i] * step;
      if (y > 9) y = -9;
      arr[i * 3 + 1] = y;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.rotation.y += (pointer.x * 0.25 - pts.rotation.y) * Math.min(1, delta * 1.5);
    pts.position.z = -4 + scroll * 6;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        sizeAttenuation
        color="#2d7450"
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}
