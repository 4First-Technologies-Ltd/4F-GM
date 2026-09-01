"use client";

import { Environment, Lightformer } from "@react-three/drei";

/**
 * Self-contained lighting rig. Uses an inline (non-networked) Environment so
 * there is no HDR fetch on load.
 */
export function Lighting({ withEnvironment = true }: { withEnvironment?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} color="#eafff1" />
      <pointLight position={[-6, -2, -4]} intensity={40} color="#2d7450" />
      <pointLight position={[6, 3, 2]} intensity={22} color="#a9714c" />
      {withEnvironment && (
        <Environment resolution={128}>
          <Lightformer
            intensity={2}
            position={[0, 3, -4]}
            scale={[10, 4, 1]}
            color="#dff5e6"
          />
          <Lightformer
            intensity={1.2}
            position={[-4, 1, 2]}
            scale={[4, 4, 1]}
            color="#2d7450"
          />
          <Lightformer
            intensity={1}
            position={[4, -1, 2]}
            scale={[4, 4, 1]}
            color="#a9714c"
          />
        </Environment>
      )}
    </>
  );
}
