'use client';

import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

export default function MainPCB({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('mainPCB');
  return (
    <group ref={ref}>
      <mesh material={materials.pcbGreen} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.015, 0.68]} />
      </mesh>
      {/* trace-like surface components scattered across the board */}
      {[
        [-0.42, 0.012, 0.2, 0.05],
        [-0.3, 0.012, -0.18, 0.03],
        [0.05, 0.012, -0.25, 0.04],
        [0.38, 0.012, 0.22, 0.03],
        [0.02, 0.012, 0.05, 0.06]
      ].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} material={materials.componentBlack}>
          <boxGeometry args={[s, 0.02, s]} />
        </mesh>
      ))}
    </group>
  );
}
