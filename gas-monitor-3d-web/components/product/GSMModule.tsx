'use client';

import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

/** Compact GSM/cellular board: PCB, metal-shielded cellular module, SIM tray outline,
 *  and a u.FL antenna pad that the separate Antenna component visually connects to. */
export default function GSMModule({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('gsmModule');
  return (
    <group ref={ref} scale={0.55}>
      <mesh material={materials.pcbDark} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.02, 0.62]} />
      </mesh>
      {/* cellular module shield */}
      <mesh position={[0, 0.035, 0.05]} material={materials.shield} castShadow>
        <boxGeometry args={[0.34, 0.06, 0.4]} />
      </mesh>
      {/* SIM tray outline */}
      <mesh position={[-0.16, 0.011, -0.22]} material={materials.componentBlack}>
        <boxGeometry args={[0.16, 0.004, 0.1]} />
      </mesh>
      {/* u.FL antenna pad */}
      <mesh position={[0.2, 0.015, -0.24]} material={materials.goldPin}>
        <cylinderGeometry args={[0.02, 0.02, 0.02, 12]} />
      </mesh>
    </group>
  );
}

export function Antenna({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('antenna');
  return (
    <group ref={ref} scale={0.55}>
      <mesh material={materials.brushedMetal} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.5, 12]} />
      </mesh>
      <mesh position={[0, -0.27, 0]} material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 12]} />
      </mesh>
    </group>
  );
}
