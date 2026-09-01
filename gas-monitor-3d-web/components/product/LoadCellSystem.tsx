'use client';

import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';
import { ComponentKey } from '@/lib/three/productConfig';

/** A single strain-gauge load cell: a brushed-metal structural beam with a bolt at each
 *  end, standing in for the weight-sensing hardware under each corner of the base plate. */
function LoadCellUnit({ materials, componentKey }: { materials: ProductMaterials; componentKey: ComponentKey }) {
  const { ref } = useComponentTransform(componentKey);
  return (
    <group ref={ref} scale={0.5}>
      <mesh material={materials.brushedMetal} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.05, 0.32]} />
      </mesh>
      <mesh position={[0, 0, 0.15]} material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.06, 12]} />
      </mesh>
      <mesh position={[0, 0, -0.15]} material={materials.componentBlack} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.06, 12]} />
      </mesh>
    </group>
  );
}

export function LoadCellSystem({ materials }: { materials: ProductMaterials }) {
  const keys: ComponentKey[] = ['loadCellFL', 'loadCellFR', 'loadCellBL', 'loadCellBR'];
  return (
    <>
      {keys.map((k) => (
        <LoadCellUnit key={k} materials={materials} componentKey={k} />
      ))}
    </>
  );
}

/** HX711-style load-cell amplifier board that the four load cells wire into. */
export function LoadCellAmplifier({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('loadCellAmplifier');
  return (
    <group ref={ref} scale={0.55}>
      <mesh material={materials.pcbDark} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.02, 0.24]} />
      </mesh>
      <mesh position={[0, 0.025, 0]} material={materials.componentBlack} castShadow>
        <boxGeometry args={[0.14, 0.03, 0.1]} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[-0.16 + i * 0.065, 0.02, 0.11]} material={materials.goldPin}>
          <boxGeometry args={[0.02, 0.02, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}
