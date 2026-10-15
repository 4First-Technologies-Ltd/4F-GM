// Minimal ASCII DXF (R12) writer: lines, arcs, circles. Opens in AutoCAD, LibreCAD, Fusion, and
// laser/waterjet shop software. Units are millimetres, Y up, matching the CAD model's plan view.
export class Dxf {
  constructor() {
    this.ents = [];
  }
  #pair(code, value) {
    return `${code}\n${value}\n`;
  }
  line(x1, y1, x2, y2, layer = "0") {
    this.ents.push(
      this.#pair(0, "LINE") + this.#pair(8, layer) +
        this.#pair(10, x1) + this.#pair(20, y1) + this.#pair(30, 0) +
        this.#pair(11, x2) + this.#pair(21, y2) + this.#pair(31, 0),
    );
  }
  circle(x, y, r, layer = "0") {
    this.ents.push(
      this.#pair(0, "CIRCLE") + this.#pair(8, layer) +
        this.#pair(10, x) + this.#pair(20, y) + this.#pair(30, 0) + this.#pair(40, r),
    );
  }
  arc(x, y, r, a0, a1, layer = "0") {
    this.ents.push(
      this.#pair(0, "ARC") + this.#pair(8, layer) +
        this.#pair(10, x) + this.#pair(20, y) + this.#pair(30, 0) + this.#pair(40, r) +
        this.#pair(50, a0) + this.#pair(51, a1),
    );
  }
  roundedRect(cx, cy, w, d, r, layer = "0") {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
    this.line(x0 + r, y0, x1 - r, y0, layer);
    this.line(x1, y0 + r, x1, y1 - r, layer);
    this.line(x1 - r, y1, x0 + r, y1, layer);
    this.line(x0, y1 - r, x0, y0 + r, layer);
    this.arc(x1 - r, y0 + r, r, 270, 360, layer);
    this.arc(x1 - r, y1 - r, r, 0, 90, layer);
    this.arc(x0 + r, y1 - r, r, 90, 180, layer);
    this.arc(x0 + r, y0 + r, r, 180, 270, layer);
  }
  toString() {
    return (
      this.#pair(0, "SECTION") + this.#pair(2, "HEADER") + this.#pair(9, "$ACADVER") + this.#pair(1, "AC1009") +
      this.#pair(0, "ENDSEC") + this.#pair(0, "SECTION") + this.#pair(2, "ENTITIES") +
      this.ents.join("") + this.#pair(0, "ENDSEC") + this.#pair(0, "EOF")
    );
  }
}
