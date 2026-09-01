'use client';

import { ProductMaterials } from '@/lib/three/materials';
import { useComponentTransform } from '@/components/experience/useComponentTransform';

/** Recognizable ESP32-style dev module: PCB, central shielded MCU can, castellated
 *  header pins along both long edges, and the printed antenna trace at one end. */
export default function ESP32({ materials }: { materials: ProductMaterials }) {
  const { ref } = useComponentTransform('esp32');
  const pinCount = 8;
  return (
    <group ref={ref} scale={0.55}>
      <mesh material={materials.pcbDark} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.02, 0.9]} />
      </mesh>
      {/* metal RF shield can over the MCU */}
      <mesh position={[0, 0.03, 0.1]} material={materials.shield} castShadow>
        <boxGeometry args={[0.28, 0.05, 0.28]} />
      </mesh>
      {/* printed antenna trace */}
      <mesh position={[0, 0.011, -0.38]} material={materials.componentBlack}>
        <boxGeometry args={[0.14, 0.002, 0.14]} />
      </mesh>
      {/* header pins */}
      {Array.from({ length: pinCount }).map((_, i) => {
        const z = -0.32 + (i * 0.64) / (pinCount - 1);
        return (
          <group key={i}>
            <mesh position={[-0.27, 0.02, z]} material={materials.goldPin}>
              <boxGeometry args={[0.03, 0.03, 0.03]} />
            </mesh>
            <mesh position={[0.27, 0.02, z]} material={materials.goldPin}>
              <boxGeometry args={[0.03, 0.03, 0.03]} />
            </mesh>
          </group>
        );
      })}
      {/* usb connector */}
      <mesh position={[0, 0.02, 0.44]} material={materials.brushedMetal} castShadow>
        <boxGeometry args={[0.16, 0.06, 0.06]} />
      </mesh>
    </group>
  );
}
