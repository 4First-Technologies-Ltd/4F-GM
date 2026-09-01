'use client';

import { RoundedBox } from '@react-three/drei';
import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

/**
 * Upper enclosure half: rounded black shell + the front status window cutout implied by
 * the display module sitting just in front of it. The orange perimeter LED ring lives on
 * the lower shell so it reads as a continuous ring when assembled.
 */
export function UpperShell({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('upperShell');
  return (
    <group ref={ref}>
      <RoundedBox args={[1.5, 0.32, 1.0]} radius={0.09} smoothness={4} material={materials.shellGloss} castShadow receiveShadow />
      {/* power button housing bump */}
      <mesh position={[0.52, 0.17, -0.38]} material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 24]} />
      </mesh>
    </group>
  );
}

export function LowerShell({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('lowerShell');
  return (
    <group ref={ref}>
      <RoundedBox args={[1.5, 0.32, 1.0]} radius={0.09} smoothness={4} material={materials.shellMatte} castShadow receiveShadow />
      {/* orange perimeter accent ring, embedded near the base of the lower shell */}
      <mesh position={[0, -0.14, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.ledOrange}>
        <torusGeometry args={[0.66, 0.012, 8, 64]} />
      </mesh>
      {/* base plate feet */}
      {[
        [-0.62, -0.17, 0.42],
        [0.62, -0.17, 0.42],
        [-0.62, -0.17, -0.42],
        [0.62, -0.17, -0.42]
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} material={materials.brushedMetal} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 16]} />
        </mesh>
      ))}
    </group>
  );
}

export function InnerFrame({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('innerFrame');
  return (
    <group ref={ref}>
      <RoundedBox args={[1.3, 0.06, 0.82]} radius={0.03} smoothness={2} material={materials.innerFrame} castShadow receiveShadow />
    </group>
  );
}

export function MechanicalHardware({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('mechanicalHardware');
  const corners: [number, number, number][] = [
    [-0.6, 0.02, 0.35],
    [0.6, 0.02, 0.35],
    [-0.6, 0.02, -0.35],
    [0.6, 0.02, -0.35]
  ];
  return (
    <group ref={ref}>
      {corners.map((p, i) => (
        <mesh key={i} position={p} material={materials.brushedMetal} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.08, 8]} />
        </mesh>
      ))}
    </group>
  );
}
