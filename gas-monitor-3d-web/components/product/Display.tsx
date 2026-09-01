'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

/** Front status display: dark glass panel with a subtle emissive readout. Text is a
 *  visual accent, not load-bearing — the same copy exists in the HTML overlay. */
export default function DisplayModule({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('displayModule');
  return (
    <group ref={ref} scale={0.9}>
      <mesh material={materials.glass} castShadow>
        <boxGeometry args={[0.62, 0.28, 0.02]} />
      </mesh>
      <mesh position={[0, 0, 0.012]} material={materials.displayScreen}>
        <planeGeometry args={[0.54, 0.2]} />
      </mesh>
      <Text position={[0, 0.045, 0.02]} fontSize={0.05} color="#e9f5ec" anchorX="center" anchorY="middle">
        12.5 KG
      </Text>
      <Text position={[0, -0.06, 0.02]} fontSize={0.028} color="#5fb489" anchorX="center" anchorY="middle">
        CONNECTED · LTE
      </Text>
    </group>
  );
}

export function PowerButton({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('powerButton');
  return (
    <group ref={ref} scale={0.7}>
      <mesh material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 24]} />
      </mesh>
      <mesh position={[0, 0.018, 0]} material={materials.ledGreen}>
        <cylinderGeometry args={[0.012, 0.012, 0.005, 16]} />
      </mesh>
    </group>
  );
}

/** Subtle emissive pulse on the perimeter LED and status indicator — decorative only,
 *  driven by clock time (not scroll), so it never competes with the reversible
 *  assemble/explode animation or the "freeze exactly on stop" requirement. */
export function StatusPulse({ materials }: { materials: ProductMaterials }) {
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    const pulse = 1.3 + Math.sin(t.current * 1.6) * 0.35;
    materials.ledOrange.emissiveIntensity = pulse;
    materials.ledGreen.emissiveIntensity = 1.1 + Math.sin(t.current * 2.4 + 1) * 0.3;
  });
  return null;
}
