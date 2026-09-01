export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpVec3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Smooth ease-in-out, used to shape a raw 0-1 progress value. */
export const easeInOutCubic = (t: number) => {
  const c = clamp(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/** Remap `value` from [inMin, inMax] to [0, 1], clamped, then ease it. Used to stagger
 *  each component's own local explosion progress within the overall scroll timeline. */
export const remapStage = (value: number, start: number, end: number) => {
  if (end <= start) return value >= end ? 1 : 0;
  return easeInOutCubic(clamp((value - start) / (end - start)));
};

/** Exponential damping factor for frame-rate independent smoothing (critically-damped lerp). */
export const dampT = (lambda: number, delta: number) => 1 - Math.exp(-lambda * delta);
