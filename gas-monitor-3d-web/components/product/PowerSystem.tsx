'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

export function Battery({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('battery');
  return (
    <group ref={ref} scale={0.6}>
      <mesh material={materials.batteryBody} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.09, 0.28]} />
      </mesh>
      <mesh position={[0, 0.05, 0.11]} material={materials.componentBlack}>
        <boxGeometry args={[0.1, 0.01, 0.03]} />
      </mesh>
    </group>
  );
}

/** Voltage regulator / power-management board sitting between the battery and PCB. */
export function PowerManagement({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('powerManagement');
  return (
    <group ref={ref} scale={0.55}>
      <mesh material={materials.pcbDark} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.02, 0.3]} />
      </mesh>
      <mesh position={[-0.08, 0.025, 0]} material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
      </mesh>
      <mesh position={[0.08, 0.02, 0.06]} material={materials.shield}>
        <boxGeometry args={[0.1, 0.03, 0.08]} />
      </mesh>
    </group>
  );
}

/** A short curved insulated wire between two world-space points, re-evaluated every
 *  frame from the two component groups it connects so it stays attached through the
 *  explosion. Kept subtle — visible mid-to-late timeline, not a scene-stealer. */
export function Wiring({ materials }: { materials: ProductMaterials }) {
  const { ref: fromRef } = useComponentTransform('powerManagement');
  const { ref: toRef } = useComponentTransform('battery');
  return (
    <>
      <group ref={fromRef} />
      <group ref={toRef} />
      <WireBetween materials={materials} a={fromRef} b={toRef} />
    </>
  );
}

function WireBetween({
  materials,
  a,
  b
}: {
  materials: ProductMaterials;
  a: React.RefObject<THREE.Group | null>;
  b: React.RefObject<THREE.Group | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const pa = a.current?.position;
    const pb = b.current?.position;
    if (!mesh || !pa || !pb) return;
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(pb);
    mesh.rotateX(Math.PI / 2);
    const len = pa.distanceTo(pb);
    mesh.scale.set(1, Math.max(len, 0.001), 1);
  });

  return (
    <mesh ref={meshRef} material={materials.wireInsulation}>
      <cylinderGeometry args={[0.012, 0.012, 1, 8]} />
    </mesh>
  );
}
