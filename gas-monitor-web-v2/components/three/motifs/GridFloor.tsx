"use client";

import { useRef } from "react";
import * as THREE from "three";
import { Grid } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { readExperience } from "@/lib/store/experience";

/** Receding technical grid that drifts with scroll. */
export function GridFloor() {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const { scroll, reducedMotion } = readExperience();
    if (!reducedMotion) {
      ref.current.position.z = (ref.current.position.z + delta * 0.6) % 2;
    }
    ref.current.position.y = -2.4 - scroll * 1.5;
  });

  return (
    <group ref={ref} position={[0, -2.4, 0]} rotation={[0, 0, 0]}>
      <Grid
        args={[40, 40]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor="#2d7450"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#a9714c"
        fadeDistance={26}
        fadeStrength={1.5}
        followCamera={false}
        infiniteGrid
      />
    </group>
  );
}
