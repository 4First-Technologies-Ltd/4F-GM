'use client';

import { ContactShadows } from '@react-three/drei';
import CameraController from '@/components/experience/CameraController';
import ProductLabels from '@/components/experience/ProductLabels';
import ProductProceduralModel from './ProductModel';

/**
 * Premium dark studio: ambient fill + key/rim/fill directional lights + a soft orange
 * accent that echoes the device's own perimeter LED, plus a contact-shadow ground plane.
 */
export default function ProductScene() {
  return (
    <>
      <color attach="background" args={['#08100c']} />
      <fog attach="fog" args={['#08100c', 6, 13]} />

      <ambientLight intensity={0.6} color="#dfe7e2" />
      <directionalLight position={[3, 4, 2]} intensity={2.4} color="#ffffff" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 1.5, -2.5]} intensity={1.1} color="#a9c6ff" />
      <pointLight position={[0, -0.6, 1.4]} intensity={1.4} color="#ff7a30" distance={5} decay={2} />
      <directionalLight position={[0, 2, -3]} intensity={0.9} color="#ffffff" />
      <hemisphereLight args={['#cfe6d8', '#0a120d', 0.5]} />

      <CameraController />
      <ProductProceduralModel />
      <ProductLabels />

      <ContactShadows position={[0, -1.05, 0]} opacity={0.55} scale={8} blur={2.2} far={2} color="#000000" />
    </>
  );
}
