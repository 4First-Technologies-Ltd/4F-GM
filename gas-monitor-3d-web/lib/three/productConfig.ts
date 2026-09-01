export type Vec3 = readonly [number, number, number];

export interface TransformState {
  position: Vec3;
  rotation: Vec3;
}

export interface ComponentState {
  assembled: TransformState;
  exploded: TransformState;
  /** [start, end] within overall scroll progress (0-1) that this component animates across. */
  stage: readonly [number, number];
  /** Human label shown once the component is sufficiently separated. */
  label?: string;
}

/**
 * Central tuning object for the whole experience. Every distance below is expressed in
 * "device units" where the assembled enclosure is ~1.5 units long — CameraController and
 * ProductModel both read from here so the animation can be retuned without touching
 * component code, and so a future GLB swap only needs new position/rotation values.
 */
export const PRODUCT_CONFIG = {
  camera: {
    // Spherical orbit around the origin. Angles in radians, distances in device units.
    startAngle: 0.35,
    orbitAmount: 4.55, // ~260 degrees across the full scroll
    startRadius: 3.6,
    endRadius: 7.4,
    startHeight: 1.1,
    endHeight: 2.7,
    fov: 32
  },
  responsive: {
    mobileBreakpoint: 768,
    mobileExplosionScale: 0.6,
    mobileRadiusScale: 1.4,
    mobileOrbitScale: 0.7
  },
  explosion: {
    // Global multiplier applied to every exploded position below.
    scale: 0.78
  },
  timeline: {
    // Stage ranges referenced by ProductLabels / ProductHero copy transitions.
    shells: [0.12, 0.35],
    electronics: [0.35, 0.6],
    sensors: [0.55, 0.82],
    full: [0.82, 1]
  }
} as const;

/**
 * Every major part of the device, with its assembled (closed enclosure) and exploded
 * (engineering exploded-view) position + rotation, plus the portion of the scroll
 * timeline it animates across. Positions are hand-placed, not randomized, and mirror
 * each part's real location inside the enclosure.
 */
export const COMPONENT_STATES: Record<string, ComponentState> = {
  upperShell: {
    assembled: { position: [0, 0.16, 0], rotation: [0, 0, 0] },
    exploded: { position: [0, 1.85, 0], rotation: [0, 0.02, 0] },
    stage: [0.1, 0.34],
    label: 'Enclosure — Upper Shell'
  },
  lowerShell: {
    assembled: { position: [0, -0.16, 0], rotation: [0, 0, 0] },
    exploded: { position: [0, -1.95, 0], rotation: [0, -0.02, 0] },
    stage: [0.1, 0.34]
  },
  innerFrame: {
    assembled: { position: [0, 0, 0], rotation: [0, 0, 0] },
    exploded: { position: [0, 1.0, 0], rotation: [0, 0, 0] },
    stage: [0.16, 0.4]
  },
  mainPCB: {
    assembled: { position: [0, 0.03, -0.02], rotation: [0, 0, 0] },
    exploded: { position: [0, 0.55, 0.15], rotation: [0, 0, 0] },
    stage: [0.33, 0.56],
    label: 'Main PCB'
  },
  esp32: {
    assembled: { position: [-0.28, 0.09, 0.12], rotation: [0, 0, 0] },
    exploded: { position: [-1.35, 0.65, 1.1], rotation: [0, 0.35, 0] },
    stage: [0.36, 0.59],
    label: 'ESP32 Module'
  },
  gsmModule: {
    assembled: { position: [0.3, 0.09, 0.02], rotation: [0, 0, 0] },
    exploded: { position: [1.4, 0.55, 0.75], rotation: [0, -0.3, 0] },
    stage: [0.38, 0.61],
    label: 'GSM Module'
  },
  antenna: {
    assembled: { position: [0.42, 0.1, -0.1], rotation: [0, 0, 0.08] },
    exploded: { position: [1.95, 1.05, 0.35], rotation: [0.1, -0.2, 0.35] },
    stage: [0.43, 0.63],
    label: 'GSM Antenna'
  },
  powerManagement: {
    assembled: { position: [-0.18, 0.06, -0.28], rotation: [0, 0, 0] },
    exploded: { position: [-1.05, 0.35, -1.35], rotation: [0, 0.25, 0] },
    stage: [0.39, 0.61],
    label: 'Power Management'
  },
  battery: {
    assembled: { position: [0.16, 0.02, -0.3], rotation: [0, 0, 0] },
    exploded: { position: [0.95, -0.15, -1.55], rotation: [0, -0.15, 0] },
    stage: [0.41, 0.63],
    label: 'Battery'
  },
  loadCellFL: {
    assembled: { position: [-0.42, -0.1, 0.32], rotation: [0, 0, 0] },
    exploded: { position: [-1.55, -1.1, 1.35], rotation: [0.1, 0.2, 0] },
    stage: [0.55, 0.79],
    label: 'Load Cell'
  },
  loadCellFR: {
    assembled: { position: [0.42, -0.1, 0.32], rotation: [0, 0, 0] },
    exploded: { position: [1.55, -1.1, 1.35], rotation: [0.1, -0.2, 0] },
    stage: [0.57, 0.81]
  },
  loadCellBL: {
    assembled: { position: [-0.42, -0.1, -0.32], rotation: [0, 0, 0] },
    exploded: { position: [-1.55, -1.15, -1.4], rotation: [-0.1, 0.2, 0] },
    stage: [0.59, 0.83]
  },
  loadCellBR: {
    assembled: { position: [0.42, -0.1, -0.32], rotation: [0, 0, 0] },
    exploded: { position: [1.55, -1.15, -1.4], rotation: [-0.1, -0.2, 0] },
    stage: [0.61, 0.85]
  },
  loadCellAmplifier: {
    assembled: { position: [0, -0.08, 0.02], rotation: [0, 0, 0] },
    exploded: { position: [0, -1.5, -0.45], rotation: [0, 0.5, 0] },
    stage: [0.58, 0.82],
    label: 'HX711 Amplifier'
  },
  displayModule: {
    assembled: { position: [0, 0.08, 0.44], rotation: [0, 0, 0] },
    exploded: { position: [0, 0.9, 2.15], rotation: [0, 0, 0] },
    stage: [0.44, 0.66],
    label: 'Status Display'
  },
  powerButton: {
    assembled: { position: [0.52, 0.17, -0.38], rotation: [0, 0, 0] },
    exploded: { position: [1.2, 1.5, -1.1], rotation: [0.3, 0, 0.2] },
    stage: [0.48, 0.7]
  },
  mechanicalHardware: {
    assembled: { position: [0, 0, 0], rotation: [0, 0, 0] },
    exploded: { position: [0, 0.25, 0], rotation: [0, 0, 0] },
    stage: [0.6, 0.85]
  }
} as const;

export type ComponentKey = keyof typeof COMPONENT_STATES;
