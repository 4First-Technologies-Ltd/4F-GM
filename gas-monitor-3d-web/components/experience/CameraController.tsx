'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { lerp } from '@/lib/three/animationUtils';
import { PRODUCT_CONFIG } from '@/lib/three/productConfig';
import { useProgress } from './ProgressContext';

const { camera: CAM } = PRODUCT_CONFIG;

/**
 * Cinematic orbit tied directly to scroll progress: the camera slowly circles the device
 * while dollying back and rising slightly, revealing front / side / rear / exploded
 * internals in one continuous move. No autonomous motion — progress is the only input.
 */
export default function CameraController() {
  const { progressRef, orbitScale, radiusScale, reducedMotion } = useProgress();
  const { camera } = useThree();

  useFrame(() => {
    const p = progressRef.current;
    const orbit = reducedMotion ? CAM.orbitAmount * 0.15 : CAM.orbitAmount * orbitScale;
    const angle = CAM.startAngle + p * orbit;

    const radius = lerp(CAM.startRadius, CAM.endRadius, p) * radiusScale;
    const height = lerp(CAM.startHeight, CAM.endHeight, p);

    camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
