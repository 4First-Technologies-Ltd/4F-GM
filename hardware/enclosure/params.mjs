// All dimensions in millimetres. Origin = centre of the weighing platform, z = 0 at the
// underside of the base plate. +Y is the rear of the unit, -Y is the front (electronics pod).
//
// Every number marked ASSUMED is a placeholder until real parts are chosen — edit here and
// re-run `npm run build`; nothing else in the model hardcodes a dimension.

export const P = {
  // --- Weighing platform ---------------------------------------------------------------
  plat: 460, // square footprint; 50 kg cylinders are ~380-400 mm diameter (ASSUMED, verify)
  cornerR: 20,
  baseT: 6, // base plate, 6 mm aluminium 5083/6061 (laser cut)
  gap: 24, // clear height between plates (load cell zone)
  topT: 8, // top plate, 8 mm aluminium — ~0.4 mm mid-span deflection at 90 kg (hand calc)
  cellInset: 55, // load cell centre distance in from each plate edge
  podZone: 150, // extra base plate depth in front of the platform for the pod

  // --- Load cell variants (both supported, picked per build) ----------------------------
  bar: { L: 80, W: 12.7, H: 12.7, boltOffset: 30, holeD: 5.5 }, // shear-beam, ASSUMED
  disc: { D: 40, holeD: 8.5 }, // button/compression cell, ASSUMED

  // --- Cylinder retention ---------------------------------------------------------------
  ring: { id: 410, od: 430, h: 10 }, // outer retainer, sized for the largest cylinder
  reducerOd: 406,
  // inner diameters of drop-in reducer rings; cylinder diameters are ASSUMED, measure yours
  reducers: { "3kg": 205, "6kg": 260, "12.5kg": 315, "25kg": 355 },

  // --- Rain skirt around the weighing gap ------------------------------------------------
  skirt: { t: 3, clearToBase: 3 },

  // --- Electronics pod (printed ASA, gasketed lid) --------------------------------------
  pod: {
    w: 300,
    d: 130,
    h: 75,
    wall: 3.5,
    floor: 3.5,
    r: 8,
    lidT: 4,
    lidOverhang: 2,
    gasketGroove: { inset: 4, width: 3.2, depth: 2.5 },
    ribInset: 4.8,
    ribW: 1.6,
    ribH: 1.5,
    bossInset: 13,
    bossD: 9,
    insertPilotD: 5.6, // M4 heat-set insert
    lidHoleD: 4.5,
    earLen: 22,
    earHoleD: 5.5,
    earY: 35,
    gapToSkirt: 12,
  },
  glandM16: 16.2,
  glandM12: 12.2,
  sma: 6.6,
  ledPipe: 5,

  // --- Internal envelopes (ASSUMED industrial boards — replace with real part sizes) ----
  controller: { w: 100, d: 80, h: 16, hole: [90, 70] },
  modem: { w: 70, d: 60, h: 20, hole: [62, 52] },
  standoff: { h: 6, od: 7, id: 2.5 },
  cell: { dia: 34.2, len: 61.5 }, // D-size Li-SOCl2 primary cell (ER34615)
  batteryCount: 2,

  // --- Load / material numbers used in the build report ----------------------------------
  maxGross_kg: 100, // 50 kg gas + steel tare + margin
  alu_g_per_cm3: 2.70,
  asa_g_per_cm3: 1.07,
};

export const derive = (p = P) => {
  const topZ0 = p.baseT + p.gap; // underside of top plate
  const topZ1 = topZ0 + p.topT;
  const half = p.plat / 2;
  const podCy = -(half + p.pod.gapToSkirt + p.pod.d / 2);
  const cellXY = half - p.cellInset;
  return { topZ0, topZ1, half, podCy, cellXY };
};
