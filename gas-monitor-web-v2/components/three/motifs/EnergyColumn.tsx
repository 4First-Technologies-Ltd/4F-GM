"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { readExperience } from "@/lib/store/experience";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormalW;
  uniform float uTime;
  uniform float uLevel;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorLow;

  void main() {
    // Fill line with a soft glowing edge.
    float fill = smoothstep(uLevel + 0.015, uLevel - 0.015, vUv.y);
    float edge = smoothstep(0.05, 0.0, abs(vUv.y - uLevel));

    // Traveling scanlines within the filled region.
    float scan = 0.5 + 0.5 * sin(vUv.y * 60.0 - uTime * 2.2);
    scan = mix(1.0, scan, 0.25);

    // Color shifts toward the clay warning hue as level drops.
    vec3 body = mix(uColorLow, uColorA, smoothstep(0.12, 0.4, uLevel));
    vec3 col = mix(uColorB * 0.15, body * scan, fill);
    col += edge * uColorB * 1.6;

    // Fresnel rim so the glass shell reads even when empty.
    float fres = pow(1.0 - abs(vNormalW.z), 2.5);
    col += fres * uColorA * 0.5;

    float alpha = clamp(fill * 0.9 + edge * 0.9 + fres * 0.35, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * The recurring motif: gas level rendered as a column of light. `uLevel` is
 * driven live from the experience store so the same component reacts to
 * scroll beats on the marketing pages and to real device data on the
 * dashboard.
 */
export function EnergyColumn({
  position = [0, 0, 0],
  scale = 1,
}: {
  position?: [number, number, number];
  scale?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uLevel: { value: readExperience().level },
          uColorA: { value: new THREE.Color("#2d7450") },
          uColorB: { value: new THREE.Color("#7bf5b4") },
          uColorLow: { value: new THREE.Color("#a9714c") },
        },
      }),
    [],
  );

  useFrame((_, delta) => {
    const { level, pointer, reducedMotion } = readExperience();
    material.uniforms.uTime.value += delta;
    material.uniforms.uLevel.value +=
      (level - material.uniforms.uLevel.value) * Math.min(1, delta * 3);
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y +=
        (pointer.x * 0.6 - groupRef.current.rotation.y) * Math.min(1, delta * 2);
      groupRef.current.rotation.x +=
        (-pointer.y * 0.25 - groupRef.current.rotation.x) *
        Math.min(1, delta * 2);
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <mesh>
        <cylinderGeometry args={[1, 1, 3.4, 64, 1, true]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}
