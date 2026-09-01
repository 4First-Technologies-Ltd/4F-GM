'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * One shared material instance per surface type, created once and disposed on unmount.
 * Keeping this centralized avoids allocating a new material per mesh per render.
 */
export function useProductMaterials() {
  const materials = useMemo(
    () => ({
      shellMatte: new THREE.MeshPhysicalMaterial({
        color: '#191c1f',
        roughness: 0.5,
        metalness: 0.2,
        clearcoat: 0.4,
        clearcoatRoughness: 0.35
      }),
      shellGloss: new THREE.MeshPhysicalMaterial({
        color: '#20242a',
        roughness: 0.16,
        metalness: 0.35,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12
      }),
      innerFrame: new THREE.MeshStandardMaterial({
        color: '#2a2e33',
        roughness: 0.4,
        metalness: 0.75
      }),
      brushedMetal: new THREE.MeshStandardMaterial({
        color: '#9aa0a6',
        roughness: 0.35,
        metalness: 0.9
      }),
      pcbGreen: new THREE.MeshStandardMaterial({
        color: '#12522f',
        roughness: 0.6,
        metalness: 0.1
      }),
      pcbDark: new THREE.MeshStandardMaterial({
        color: '#232b26',
        roughness: 0.55,
        metalness: 0.2
      }),
      componentBlack: new THREE.MeshStandardMaterial({
        color: '#2a2c2f',
        roughness: 0.4,
        metalness: 0.5
      }),
      shield: new THREE.MeshStandardMaterial({
        color: '#c7ccd1',
        roughness: 0.3,
        metalness: 0.95
      }),
      goldPin: new THREE.MeshStandardMaterial({
        color: '#d8b45a',
        roughness: 0.35,
        metalness: 0.85
      }),
      batteryBody: new THREE.MeshStandardMaterial({
        color: '#1c2b1f',
        roughness: 0.5,
        metalness: 0.2
      }),
      wireInsulation: new THREE.MeshStandardMaterial({
        color: '#26221f',
        roughness: 0.7,
        metalness: 0.05
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#050607',
        roughness: 0.08,
        metalness: 0,
        transmission: 0.15,
        transparent: true,
        opacity: 0.95,
        clearcoat: 1
      }),
      ledOrange: new THREE.MeshStandardMaterial({
        color: '#ff7a30',
        emissive: '#ff7a30',
        emissiveIntensity: 1.6,
        roughness: 0.4,
        metalness: 0
      }),
      ledGreen: new THREE.MeshStandardMaterial({
        color: '#3fd67a',
        emissive: '#3fd67a',
        emissiveIntensity: 1.4,
        roughness: 0.4,
        metalness: 0
      }),
      displayScreen: new THREE.MeshStandardMaterial({
        color: '#08120d',
        emissive: '#0f2a1c',
        emissiveIntensity: 0.6,
        roughness: 0.25,
        metalness: 0
      })
    }),
    []
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return materials;
}

export type ProductMaterials = ReturnType<typeof useProductMaterials>;
