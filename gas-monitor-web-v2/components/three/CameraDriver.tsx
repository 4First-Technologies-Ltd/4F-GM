"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { readExperience } from "@/lib/store/experience";
import * as THREE from "three";

const target = new THREE.Vector3(0, 0, 0);

/**
 * Moves the camera along a scripted path as the page scrolls, with a small
 * pointer-driven parallax on top. Runs inside the Canvas.
 */
export function CameraDriver() {
  const camera = useThree((s) => s.camera);

  useFrame((_, delta) => {
    const { scroll, pointer, reducedMotion } = readExperience();
    const k = Math.min(1, delta * 2.5);

    // Scripted dolly across the grid landscape: skim low, rise gently, and
    // ease back as the page scrolls.
    const desiredZ = 8 - Math.sin(scroll * Math.PI) * 1.2;
    const desiredY = 1.2 + scroll * 1.4;
    const px = reducedMotion ? 0 : pointer.x * 0.5;
    const py = reducedMotion ? 0 : pointer.y * 0.3;

    camera.position.x += (px - camera.position.x) * k;
    camera.position.y += (desiredY + py - camera.position.y) * k;
    camera.position.z += (desiredZ - camera.position.z) * k;

    // Look toward the horizon so the grid reads as a receding plane.
    target.set(0, 0.6 + scroll * 0.6, -6);
    camera.lookAt(target);
  });

  return null;
}
