// Parametric model of the 4FG outdoor cylinder-scale. Run: npm run build
import fs from "node:fs";
import path from "node:path";
import opencascade from "replicad-opencascadejs";
import { setOC, makeBaseBox, makeCylinder, makeCompound, drawRoundedRectangle } from "replicad";
import { P, derive } from "./params.mjs";
import { Dxf } from "./dxf.mjs";

setOC(await opencascade());
const D = derive(P);

// ---- helpers ---------------------------------------------------------------------------
const box = (x0, x1, y0, y1, z0, z1) =>
  makeBaseBox(x1 - x0, y1 - y0, z1 - z0).translate([(x0 + x1) / 2, (y0 + y1) / 2, z0]);
const cyl = (r, h, at, dir = [0, 0, 1]) => makeCylinder(r, h, at, dir);
const rrect = (cx, cy, w, d, r, z0, t) =>
  drawRoundedRectangle(w, d, r).sketchOnPlane("XY").extrude(t).translate([cx, cy, z0]);
const cutAll = (shape, cutters) => cutters.reduce((s, c) => s.cut(c), shape);
const fuseAll = (shapes) => shapes.reduce((a, b) => a.fuse(b));

// Load cell centres (x, y) and the sign that points outward on x.
const cells = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * D.cellXY, y: sy * D.cellXY, sx })));

// Hole centres in the plates for a given load cell type.
// bar: fixed end (outer) bolts to the base plate, free end (inner) bolts to the top plate.
function plateHoles(type) {
  const base = [];
  const top = [];
  for (const c of cells) {
    if (type === "bar") {
      base.push({ x: c.x + c.sx * P.bar.boltOffset, y: c.y, d: P.bar.holeD });
      top.push({ x: c.x - c.sx * P.bar.boltOffset, y: c.y, d: P.bar.holeD });
    } else {
      base.push({ x: c.x, y: c.y, d: P.disc.holeD });
      top.push({ x: c.x, y: c.y, d: P.disc.holeD });
    }
  }
  return { base, top };
}

// Extra base plate holes: pod mounting ears, drains, ground anchors.
function baseExtras() {
  const holes = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      holes.push({ x: sx * (P.pod.w / 2 + P.pod.earLen - 9), y: D.podCy + sy * P.pod.earY, d: P.pod.earHoleD });
      holes.push({ x: sx * 100, y: sy * 100, d: 8 }); // drains
      holes.push({ x: sx * 200, y: -(D.half + P.podZone - 45), d: 10 }); // ground anchors
    }
  return holes;
}

// ---- plates ----------------------------------------------------------------------------
function basePlate(type) {
  const depth = P.plat + P.podZone;
  const cy = (P.podZone === 0 ? 0 : -P.podZone / 2);
  const holes = [...plateHoles(type).base, ...baseExtras()];
  const s = rrect(0, cy, P.plat, depth, P.cornerR, 0, P.baseT);
  return { shape: cutAll(s, holes.map((h) => cyl(h.d / 2, P.baseT + 2, [h.x, h.y, -1]))), holes, cy, depth };
}
function topPlate(type) {
  const holes = plateHoles(type).top;
  const s = rrect(0, 0, P.plat, P.plat, P.cornerR, D.topZ0, P.topT);
  return { shape: cutAll(s, holes.map((h) => cyl(h.d / 2, P.topT + 2, [h.x, h.y, D.topZ0 - 1]))), holes };
}

// ---- load cells (placeholder bodies for fit-checking) ------------------------------------
function loadCells(type) {
  if (type === "disc") {
    return cells.map((c) => cyl(P.disc.D / 2, P.gap, [c.x, c.y, P.baseT]));
  }
  const { L, W, H } = P.bar;
  const s = (P.gap - H) / 2; // riser height above/below the cell
  const out = [];
  for (const c of cells) {
    out.push(box(c.x - L / 2, c.x + L / 2, c.y - W / 2, c.y + W / 2, P.baseT + s, P.baseT + s + H));
    const fx = c.x + c.sx * P.bar.boltOffset; // fixed end, riser from base
    const ex = c.x - c.sx * P.bar.boltOffset; // free end, riser to top plate
    out.push(box(fx - 10, fx + 10, c.y - 10, c.y + 10, P.baseT, P.baseT + s));
    out.push(box(ex - 10, ex + 10, c.y - 10, c.y + 10, P.baseT + s + H, D.topZ0));
  }
  return out;
}

// ---- rain skirt, retainer ring, reducers -------------------------------------------------
function rainSkirt() {
  const t = P.skirt.t;
  const z0 = P.baseT + P.skirt.clearToBase;
  const outer = rrect(0, 0, P.plat + 2 * t, P.plat + 2 * t, P.cornerR + t, z0, D.topZ1 - z0);
  const inner = rrect(0, 0, P.plat, P.plat, P.cornerR, z0 - 1, D.topZ1 - z0 + 2);
  return outer.cut(inner);
}
const ringShape = (od, id, h, z0) => cyl(od / 2, h, [0, 0, z0]).cut(cyl(id / 2, h + 2, [0, 0, z0 - 1]));
const retainerRing = () => ringShape(P.ring.od, P.ring.id, P.ring.h, D.topZ1);
// A print-bed-friendly quarter of the retainer (the full ring is 4 of these).
const retainerQuarter = () => retainerRing().intersect(box(0.25, 400, 0.25, 400, D.topZ1 - 1, D.topZ1 + P.ring.h + 1));
const reducer = (innerD) => ringShape(P.reducerOd, innerD, P.ring.h - 2, D.topZ1);

// ---- electronics pod ---------------------------------------------------------------------
const pod = P.pod;
const podZ0 = P.baseT;
const podTop = podZ0 + pod.h;
const floorTop = podZ0 + pod.floor;
const bossXY = [-1, 1].flatMap((sx) =>
  [-1, 1].map((sy) => [sx * (pod.w / 2 - pod.bossInset), D.podCy + sy * (pod.d / 2 - pod.bossInset)]),
);
// Interior layout, left to right: battery tray | controller | 4G modem
const lay = { batX: -102, ctlX: -5, modX: 85 };

function podBody() {
  let s = rrect(0, D.podCy, pod.w, pod.d, pod.r, podZ0, pod.h);
  s = s.cut(rrect(0, D.podCy, pod.w - 2 * pod.wall, pod.d - 2 * pod.wall, pod.r - pod.wall, floorTop, pod.h));

  // gasket groove on the rim
  const g = pod.gasketGroove;
  const gOuter = rrect(0, D.podCy, pod.w - 2 * g.inset, pod.d - 2 * g.inset, pod.r - g.inset, podTop - g.depth, g.depth + 1);
  const gInner = rrect(0, D.podCy, pod.w - 2 * (g.inset + g.width), pod.d - 2 * (g.inset + g.width), Math.max(pod.r - g.inset - g.width, 1), podTop - g.depth - 1, g.depth + 3);
  s = s.cut(gOuter.cut(gInner));

  // lid screw bosses with heat-set insert pilots
  const fuses = bossXY.map(([x, y]) => cyl(pod.bossD / 2, podTop - floorTop, [x, y, floorTop]));
  // mounting ears
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x0 = sx > 0 ? pod.w / 2 - 2 : -(pod.w / 2 + pod.earLen);
      const x1 = sx > 0 ? pod.w / 2 + pod.earLen : -(pod.w / 2 - 2);
      fuses.push(box(x0, x1, D.podCy + sy * pod.earY - 11, D.podCy + sy * pod.earY + 11, podZ0, podZ0 + 4));
    }
  // battery tray: end stops and a divider so two D cells cannot shift
  const bt = { w: P.cell.len + 2, d: P.cell.dia * P.batteryCount + 4 };
  fuses.push(box(lay.batX - bt.w / 2 - 3, lay.batX - bt.w / 2, D.podCy - bt.d / 2, D.podCy + bt.d / 2, floorTop, floorTop + 12));
  fuses.push(box(lay.batX + bt.w / 2, lay.batX + bt.w / 2 + 3, D.podCy - bt.d / 2, D.podCy + bt.d / 2, floorTop, floorTop + 12));
  fuses.push(box(lay.batX - bt.w / 2, lay.batX + bt.w / 2, D.podCy - 1, D.podCy + 1, floorTop, floorTop + 10));
  // board standoffs
  const standoffs = (cx, [hx, hy]) =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sy) => cyl(P.standoff.od / 2, P.standoff.h, [cx + sx * hx / 2, D.podCy + sy * hy / 2, floorTop])));
  fuses.push(...standoffs(lay.ctlX, P.controller.hole), ...standoffs(lay.modX, P.modem.hole));
  s = fuseAll([s, ...fuses]);

  // boss pilots + penetrations
  const wallZ = podZ0 + 38;
  const rearY = D.podCy + pod.d / 2;
  const frontY = D.podCy - pod.d / 2;
  const cuts = [
    ...bossXY.map(([x, y]) => cyl(pod.insertPilotD / 2, 10, [x, y, podTop - 10])),
    cyl(P.glandM16 / 2, pod.wall + 4, [-55, rearY - pod.wall - 1, wallZ], [0, 1, 0]), // load cell cables
    cyl(P.glandM16 / 2, pod.wall + 4, [55, rearY - pod.wall - 1, wallZ], [0, 1, 0]),
    cyl(P.sma / 2, pod.wall + 4, [pod.w / 2 - pod.wall - 1, D.podCy + 25, podZ0 + 45], [1, 0, 0]), // 4G antenna (SMA bulkhead)
    cyl(P.glandM12 / 2, pod.wall + 4, [-pod.w / 2 - 1, D.podCy, podZ0 + 35], [1, 0, 0]), // optional external power / solar
    cyl(P.glandM12 / 2, pod.wall + 4, [-90, frontY - 1, wallZ], [0, 1, 0]), // breathable vent plug
    cyl(P.ledPipe / 2, pod.wall + 4, [70, frontY - 1, wallZ], [0, 1, 0]), // status LEDs
    cyl(P.ledPipe / 2, pod.wall + 4, [90, frontY - 1, wallZ], [0, 1, 0]),
  ];
  // standoff pilot holes
  for (const [cx, hp] of [[lay.ctlX, P.controller.hole], [lay.modX, P.modem.hole]])
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      cuts.push(cyl(P.standoff.id / 2, P.standoff.h, [cx + sx * hp[0] / 2, D.podCy + sy * hp[1] / 2, floorTop + 1]));
  const ear = []; // ear through-holes
  for (const sx of [-1, 1]) for (const sy of [-1, 1])
    ear.push(cyl(pod.earHoleD / 2, 8, [sx * (pod.w / 2 + pod.earLen - 9), D.podCy + sy * pod.earY, podZ0 - 1]));
  return cutAll(s, [...cuts, ...ear]);
}

function podLid() {
  const o = pod.lidOverhang;
  let s = rrect(0, D.podCy, pod.w + 2 * o, pod.d + 2 * o, pod.r + o, podTop, pod.lidT);
  // compression rib that presses the gasket in the rim groove
  const ribOuter = rrect(0, D.podCy, pod.w - 2 * pod.ribInset, pod.d - 2 * pod.ribInset, pod.r - pod.ribInset, podTop - pod.ribH, pod.ribH + 0.1);
  const ribInner = rrect(0, D.podCy, pod.w - 2 * (pod.ribInset + pod.ribW), pod.d - 2 * (pod.ribInset + pod.ribW), Math.max(pod.r - pod.ribInset - pod.ribW, 1), podTop - pod.ribH - 1, pod.ribH + 2);
  s = s.fuse(ribOuter.cut(ribInner));
  return cutAll(s, bossXY.map(([x, y]) => cyl(pod.lidHoleD / 2, pod.lidT + 4, [x, y, podTop - 2])));
}

// ---- placeholders for fit-check (not printed) ---------------------------------------------
function internals() {
  const so = floorTop + P.standoff.h;
  const parts = [
    box(lay.ctlX - P.controller.w / 2, lay.ctlX + P.controller.w / 2, D.podCy - P.controller.d / 2, D.podCy + P.controller.d / 2, so, so + P.controller.h),
    box(lay.modX - P.modem.w / 2, lay.modX + P.modem.w / 2, D.podCy - P.modem.d / 2, D.podCy + P.modem.d / 2, so, so + P.modem.h),
  ];
  for (let i = 0; i < P.batteryCount; i++) {
    const y = D.podCy + (i - (P.batteryCount - 1) / 2) * (P.cell.dia + 2);
    parts.push(cyl(P.cell.dia / 2, P.cell.len, [lay.batX - P.cell.len / 2, y, floorTop + P.cell.dia / 2], [1, 0, 0]));
  }
  return parts;
}

// ---- mesh stats (volume, bbox) -------------------------------------------------------------
function stats(shape) {
  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.2 });
  const v = m.vertices;
  const t = m.triangles;
  let vol = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3)
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]); }
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    const [ax, ay, az] = [v[a], v[a + 1], v[a + 2]];
    const [bx, by, bz] = [v[b], v[b + 1], v[b + 2]];
    const [cx, cy, cz] = [v[c], v[c + 1], v[c + 2]];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return { cm3: Math.abs(vol) / 1000, size: hi.map((h, k) => +(h - lo[k]).toFixed(1)) };
}

// ---- output ----------------------------------------------------------------------------------
const OUT = path.resolve("out");
fs.rmSync(OUT, { recursive: true, force: true });
const write = async (file, blobPromise) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await (await blobPromise).arrayBuffer()));
};
const report = [];

for (const type of ["bar", "disc"]) {
  const dir = path.join(OUT, type);
  const bp = basePlate(type);
  const tp = topPlate(type);
  const named = {
    "01_base_plate_6mm_aluminium": [bp.shape, P.alu_g_per_cm3],
    "02_top_plate_8mm_aluminium": [tp.shape, P.alu_g_per_cm3],
    "03_rain_skirt": [rainSkirt(), P.asa_g_per_cm3],
    "04_retainer_ring": [retainerRing(), P.asa_g_per_cm3],
    "05_retainer_ring_quarter_x4": [retainerQuarter(), P.asa_g_per_cm3],
    "06_pod_body_ASA": [podBody(), P.asa_g_per_cm3],
    "07_pod_lid_ASA": [podLid(), P.asa_g_per_cm3],
    ...Object.fromEntries(Object.entries(P.reducers).map(([k, d]) => [`08_reducer_ring_${k}`, [reducer(d), P.asa_g_per_cm3]])),
  };
  for (const [name, [shape, dens]] of Object.entries(named)) {
    await write(path.join(dir, "parts", `${name}.stl`), shape.blobSTL({ tolerance: 0.05, angularTolerance: 0.1 }));
    await write(path.join(dir, "parts", `${name}.step`), shape.blobSTEP());
    const s = stats(shape);
    report.push({ variant: type, part: name, size_mm: s.size, cm3: +s.cm3.toFixed(1), g: Math.round(s.cm3 * dens) });
  }
  const assembly = makeCompound([
    bp.shape, tp.shape, rainSkirt(), retainerRing(), podBody(), podLid(), ...loadCells(type), ...internals(),
  ]);
  await write(path.join(dir, `assembly_${type}.step`), assembly.blobSTEP());
  await write(path.join(dir, `assembly_${type}.stl`), assembly.blobSTL({ tolerance: 0.1, angularTolerance: 0.2 }));
  const as = stats(assembly);
  report.push({ variant: type, part: "ASSEMBLY", size_mm: as.size, cm3: +as.cm3.toFixed(1), g: null });

  // laser-cut DXF outlines
  const plateDxf = (name, w, d, cx, cy, holes) => {
    const dxf = new Dxf();
    dxf.roundedRect(cx, cy, w, d, P.cornerR, "CUT");
    holes.forEach((h) => dxf.circle(h.x, h.y, h.d / 2, "CUT"));
    fs.writeFileSync(path.join(dir, `${name}.dxf`), dxf.toString());
  };
  plateDxf("base_plate_6mm", P.plat, bp.depth, 0, bp.cy, bp.holes);
  plateDxf("top_plate_8mm", P.plat, P.plat, 0, 0, tp.holes);
}

fs.writeFileSync(path.join(OUT, "build_report.json"), JSON.stringify(report, null, 2));
console.table(report.map((r) => ({ ...r, size_mm: r.size_mm.join(" x ") })));
