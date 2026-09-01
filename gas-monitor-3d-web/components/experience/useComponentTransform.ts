'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COMPONENT_STATES, ComponentKey, PRODUCT_CONFIG } from '@/lib/three/productConfig';
import { lerpVec3, remapStage } from '@/lib/three/animationUtils';
import { useProgress } from './ProgressContext';

/**
 * Drives a mesh/group's position + rotation between its assembled and exploded states,
 * based on the shared scroll progress and this component's own stage window.
 * Returns the ref to attach to the <group>, and a getter for the component's *current*
 * local (0-1) explosion progress, used by labels to decide visibility.
 */
export function useComponentTransform(key: ComponentKey) {
  const ref = useRef<THREE.Group>(null);
  const { progressRef, explosionScale } = useProgress();
  const localProgressRef = useRef(0);
  const config = COMPONENT_STATES[key];

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const [start, end] = config.stage;
    const local = remapStage(progressRef.current, start, end);
    localProgressRef.current = local;

    const scale = PRODUCT_CONFIG.explosion.scale * explosionScale;
    const explodedPos: [number, number, number] = [
      config.assembled.position[0] + (config.exploded.position[0] - config.assembled.position[0]) * scale,
      config.assembled.position[1] + (config.exploded.position[1] - config.assembled.position[1]) * scale,
      config.assembled.position[2] + (config.exploded.position[2] - config.assembled.position[2]) * scale
    ];

    const pos = lerpVec3(config.assembled.position, explodedPos, local);
    const rot = lerpVec3(config.assembled.rotation, config.exploded.rotation, local);

    group.position.set(pos[0], pos[1], pos[2]);
    group.rotation.set(rot[0], rot[1], rot[2]);
  });

  return { ref, localProgressRef };
}
