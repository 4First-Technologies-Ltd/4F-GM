'use client';

import { useProductMaterials } from '@/lib/three/materials';
import { UpperShell, LowerShell, InnerFrame, MechanicalHardware } from './ProductShell';
import MainPCB from './MainPCB';
import ESP32 from './ESP32';
import GSMModule, { Antenna } from './GSMModule';
import { LoadCellSystem, LoadCellAmplifier } from './LoadCellSystem';
import { Battery, PowerManagement, Wiring } from './PowerSystem';
import DisplayModule, { PowerButton, StatusPulse } from './Display';

/**
 * Procedural placeholder device. This is the swap point described in the brief: once a
 * real CAD/GLB export exists, a `ProductGLTFModel` component can replace this one without
 * touching ScrollController, CameraController, ProductLabels, or the page shell — every
 * sub-part it renders is keyed by the same COMPONENT_STATES entries either way.
 */
export default function ProductProceduralModel() {
  const materials = useProductMaterials();

  return (
    <group>
      <UpperShell materials={materials} />
      <LowerShell materials={materials} />
      <InnerFrame materials={materials} />
      <MechanicalHardware materials={materials} />

      <MainPCB materials={materials} />
      <ESP32 materials={materials} />
      <GSMModule materials={materials} />
      <Antenna materials={materials} />

      <LoadCellSystem materials={materials} />
      <LoadCellAmplifier materials={materials} />

      <Battery materials={materials} />
      <PowerManagement materials={materials} />
      <Wiring materials={materials} />

      <DisplayModule materials={materials} />
      <PowerButton materials={materials} />

      <StatusPulse materials={materials} />
    </group>
  );
}
