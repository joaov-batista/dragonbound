/**
 * Pix — minimal software pixel canvas shared by the build-time asset pipeline (tools/)
 * and the runtime painters (dragons, island map sprites). No DOM dependency.
 */
export type Ramp = readonly [number, number, number, number, number];

export const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const hex = (r: number, g: number, b: number): number =>
  (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b);
const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function toHsl(c: number): [number, number, number] {
  let [r, g, b] = rgb(c);
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Shift hue toward a target hue by `amt` degrees along the shortest arc. */
function hueToward(h: number, target: number, amt: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amt) return target;
  return h + Math.sign(d) * amt;
}

/** Pixel-art colour ramp: shadows drift toward violet/blue, lights toward warm yellow. */
export function ramp(base: number): Ramp {
  const [h, s, l] = toHsl(base);
  return [
    fromHsl(hueToward(h, 255, 26), s * 0.95 + 0.05, l * 0.36),
    fromHsl(hueToward(h, 255, 13), s, l * 0.66),
    base,
    fromHsl(hueToward(h, 55, 10), s * 0.92, l + (1 - l) * 0.3),
    fromHsl(hueToward(h, 55, 18), s * 0.7, l + (1 - l) * 0.62),
  ];
}

export function shade(c: number, k: number): number {
  const [h, s, l] = toHsl(c);
  return k < 0 ? fromHsl(hueToward(h, 255, -k * 30), s, l * (1 + k)) : fromHsl(hueToward(h, 55, k * 20), s * (1 - k * 0.3), l + (1 - l) * k);
}

/** Deterministic integer hash → [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1], optional wrap period for tileable textures. */
export function vnoise(x: number, y: number, seed = 0, wrap = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const w = (a: number): number => (wrap ? ((a % wrap) + wrap) % wrap : a);
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const LX = -0.55, LY = -0.83; // light from upper-left

function lightIndex(nx: number, ny: number): number {
  const l = -(nx * LX + ny * LY) * -1;
  // l in [-1,1]; positive = facing light
  return l > 0.72 ? 4 : l > 0.3 ? 3 : l > -0.3 ? 2 : l > -0.72 ? 1 : 0;
}

export class Pix {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  px(x: number, y: number, c: number, a = 255): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (a >= 255) {
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    } else if (a > 0) {
      const da = d[i + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
      d[i] = (((c >> 16) & 255) * sa + d[i] * da * (1 - sa)) / oa;
      d[i + 1] = (((c >> 8) & 255) * sa + d[i + 1] * da * (1 - sa)) / oa;
      d[i + 2] = ((c & 255) * sa + d[i + 2] * da * (1 - sa)) / oa;
      d[i + 3] = oa * 255;
    }
  }

  erase(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  /** Colour at pixel or -1 when transparent / out of bounds. */
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] < 8) return -1;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  solid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] >= 128;
  }

  clear(): void { this.data.fill(0); }

  rect(x: number, y: number, w: number, h: number, c: number, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.px(x, y, c, a);
      }
  }

  /** Ellipse shaded with a 5-step ramp, lit from the upper-left. */
  ball(cx: number, cy: number, rx: number, ry: number, r: Ramp): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1) this.px(x, y, r[lightIndex(nx, ny)]);
      }
  }

  /** Tapered, shaded limb between two points. */
  limb(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, r: Ramp | number): void {
    const minX = Math.floor(Math.min(x0 - r0, x1 - r1)), maxX = Math.ceil(Math.max(x0 + r0, x1 + r1));
    const minY = Math.floor(Math.min(y0 - r0, y1 - r1)), maxY = Math.ceil(Math.max(y0 + r0, y1 + r1));
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        let t = ((x - x0) * dx + (y - y0) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = x0 + dx * t, py = y0 + dy * t, rad = r0 + (r1 - r0) * t;
        const ox = x - px, oy = y - py, d = Math.hypot(ox, oy);
        if (d <= rad + 0.15) {
          if (typeof r === 'number') this.px(x, y, r);
          else this.px(x, y, r[rad < 1.2 ? (oy < -0.3 || ox < -0.6 ? 3 : oy > 0.3 ? 1 : 2) : lightIndex(ox / rad, oy / rad)]);
        }
      }
  }

  poly(pts: ReadonlyArray<readonly [number, number]>, c: number, a = 255): void {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const sy = y + 0.01;
      for (let i = 0; i < pts.length; i++) {
        const a0 = pts[i], b0 = pts[(i + 1) % pts.length];
        if ((a0[1] <= sy && b0[1] > sy) || (b0[1] <= sy && a0[1] > sy))
          xs.push(a0[0] + ((sy - a0[1]) / (b0[1] - a0[1])) * (b0[0] - a0[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.px(x, y, c, a);
    }
  }

  /**
   * Bevel pass: recolours flat regions so edges facing the light get `r[3]` and
   * edges facing away get `r[1]`. Only touches pixels currently equal to `r[2]`.
   */
  bevel(r: Ramp, depth = 1): void {
    const marks: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== r[2]) continue;
        let lit = false, dark = false;
        for (let k = 1; k <= depth; k++) {
          if (!this.solid(x, y - k) || !this.solid(x - k, y)) lit = true;
          if (!this.solid(x, y + k) || !this.solid(x + k, y)) dark = true;
        }
        if (lit && !dark) marks.push(x, y, r[3]);
        else if (dark && !lit) marks.push(x, y, r[1]);
      }
    for (let i = 0; i < marks.length; i += 3) this.px(marks[i], marks[i + 1], marks[i + 2]);
  }

  /** 1px outline around opaque pixels. `c` may be a colour or a function of the neighbour colour. */
  outline(c: number | ((neighbour: number) => number), diagonal = false): void {
    const marks: number[] = [];
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const n8 = [...n4, [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.solid(x, y)) continue;
        for (const [dx, dy] of diagonal ? n8 : n4) {
          if (this.solid(x + dx, y + dy)) {
            marks.push(x, y, typeof c === 'number' ? c : c(this.get(x + dx, y + dy)));
            break;
          }
        }
      }
    for (let i = 0; i < marks.length; i += 3) this.px(marks[i], marks[i + 1], marks[i + 2]);
  }

  blit(src: Pix, dx: number, dy: number, flipX = false, sx = 0, sy = 0, sw = src.w, sh = src.h): void {
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const i = ((sy + y) * src.w + sx + (flipX ? sw - 1 - x : x)) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        this.px(dx + x, dy + y, (src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2], a);
      }
  }

  /** Recolour every opaque pixel through `fn`. */
  map(fn: (c: number, x: number, y: number) => number): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c >= 0) {
          const a = this.data[(y * this.w + x) * 4 + 3];
          const n = fn(c, x, y);
          const i = (y * this.w + x) * 4;
          this.data[i] = (n >> 16) & 255; this.data[i + 1] = (n >> 8) & 255; this.data[i + 2] = n & 255; this.data[i + 3] = a;
        }
      }
  }

  /** Soft radial glow (alpha falloff), for light sprites. */
  glow(cx: number, cy: number, r: number, c: number, strength = 1, steps = 6): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const q = Math.ceil((1 - d) * (1 - d) * steps) / steps;
        this.px(x, y, c, 255 * q * strength);
      }
  }
}

export const deg = (a: number): number => (a * Math.PI) / 180;
