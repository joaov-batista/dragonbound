import { Pix, ramp, hash2, mix, shade, type Ramp } from './Pix';
import { THEMES, type Theme } from './themes';

const OUT = 0x1a1424;
type Painter = (p: Pix) => void;
export interface PropDef { w: number; h: number; paint: Painter }

function leafBlob(p: Pix, cx: number, cy: number, rx: number, ry: number, r: Ramp, seed: number): void {
  p.ball(cx, cy, rx, ry, r);
  for (let i = 0; i < rx * ry * 0.5; i++) {
    const a = hash2(i, 1, seed) * 6.28, d = Math.sqrt(hash2(i, 2, seed));
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const lit = -(Math.cos(a) * d * 0.55 + Math.sin(a) * d * 0.83);
    const c = lit > 0.2 ? r[4] : lit > -0.3 ? r[3] : r[1];
    p.px(x, y, c); p.px(x + 1, y, c); p.px(x, y + 1, lit > 0.2 ? r[3] : r[2]);
  }
}

function tree(th: Theme, w: number, h: number, seed: number): Painter {
  return (p) => {
    const cx = w / 2, tr = th.trunk;
    // roots + trunk
    p.limb(cx - 7, h - 1, cx - 2, h - 12, 2, 2.5, tr); p.limb(cx + 8, h - 1, cx + 2, h - 12, 2, 2.5, tr);
    p.limb(cx, h - 2, cx + 1, h * 0.42, 4.5, 3.2, tr);
    p.limb(cx, h * 0.55, cx - w * 0.22, h * 0.36, 2.2, 1.5, tr); p.limb(cx + 1, h * 0.5, cx + w * 0.24, h * 0.3, 2.2, 1.5, tr);
    for (let y = Math.floor(h * 0.45); y < h - 3; y += 3) p.px(cx - 1 + (hash2(y, 1, seed) * 4 | 0), y, tr[0]);
    // canopy: back clusters darker, front lighter
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28, rx = w * 0.2 + hash2(i, 3, seed) * w * 0.08;
      leafBlob(p, cx + Math.cos(a) * w * 0.26, h * 0.3 + Math.sin(a) * h * 0.13, rx, rx * 0.8, i % 2 ? th.leaf2 : th.leaf, seed + i);
    }
    leafBlob(p, cx - 2, h * 0.26, w * 0.26, h * 0.17, th.leaf, seed + 40);
    p.outline(OUT);
  };
}

function palm(th: Theme, w: number, h: number, leanDir: number, seed: number): Painter {
  return (p) => {
    const bx = w / 2 - leanDir * w * 0.2, tx = w / 2 + leanDir * w * 0.12, ty = h * 0.3;
    const tr = ramp(0x9a7a52);
    let px = bx, py = h - 1;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = bx + (tx - bx) * t * t, y = h - 1 + (ty - (h - 1)) * t;
      p.limb(px, py, x, y, 3 - t * 1.2, 2.9 - t * 1.2, tr);
      if (i % 2 === 0) p.line(x - 2, y, x + 2, y + 1, tr[0]);
      px = x; py = y;
    }
    const fr = th.id === 'tropical' ? th.leaf : th.leaf2;
    for (let k = 0; k < 7; k++) {
      const a = -0.2 + (k / 6) * (Math.PI + 0.4), len = w * 0.42 + hash2(k, 1, seed) * 6;
      const r = k % 2 ? fr : ramp(shade(fr[2], -0.2));
      let lx = tx, ly = ty;
      for (let s = 1; s <= 10; s++) {
        const t = s / 10, x = tx + Math.cos(a) * len * t, y = ty - Math.sin(a) * len * 0.55 * t + t * t * len * 0.55;
        p.line(lx, ly, x, y, r[2]);
        const ll = 5 * (1 - Math.abs(t - 0.5));
        p.line(x, y, x - Math.cos(a) * 1.5, y + ll, r[1]); p.px(x, y - 1, r[4]);
        lx = x; ly = y;
      }
    }
    p.ball(tx - 2, ty + 2, 2.2, 2.2, ramp(0x7a5230)); p.ball(tx + 2, ty + 3, 2.2, 2.2, ramp(0x7a5230));
    p.outline(OUT);
  };
}

function rock(r: Ramp, w: number, h: number, seed: number, moss = -1): Painter {
  return (p) => {
    const n = 3 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const cx = w * (0.25 + 0.5 * hash2(i, 1, seed)), rx = w * (0.2 + 0.18 * hash2(i, 2, seed)), ry = h * (0.3 + 0.3 * hash2(i, 3, seed));
      p.ball(cx, h - ry * 0.9, rx, ry, r);
    }
    for (let i = 0; i < w * h * 0.03; i++) { const x = hash2(i, 5, seed) * w | 0, y = hash2(i, 6, seed) * h | 0; if (p.solid(x, y) && p.solid(x, y - 1)) { p.px(x, y, r[0]); p.px(x + 1, y + 1, r[0]); } }
    if (moss >= 0) for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (p.solid(x, y) && !p.solid(x, y - 1) && hash2(x >> 1, 9, seed) > 0.4) { p.px(x, y, mix(moss, 0xffffff, 0.2)); p.px(x, y + 1, moss); }
    for (let x = 0; x < w; x++) p.erase(x, h); 
    p.outline(OUT);
  };
}

function bush(r: Ramp, w: number, h: number, seed: number, berries = -1): Painter {
  return (p) => {
    for (let i = 0; i < 4; i++) leafBlob(p, w * (0.22 + i * 0.19), h * 0.62 - (i % 2) * h * 0.14, w * 0.2, h * 0.36, i % 2 ? r : ramp(shade(r[2], -0.15)), seed + i);
    if (berries >= 0) for (let i = 0; i < 7; i++) { const x = 3 + hash2(i, 1, seed) * (w - 7), y = 4 + hash2(i, 2, seed) * (h - 9); p.rect(x | 0, y | 0, 2, 2, berries); p.px(x | 0, y | 0, mix(berries, 0xffffff, 0.6)); }
    p.outline(OUT);
  };
}

function column(r: Ramp, w: number, h: number, broken: boolean, moss: number): Painter {
  return (p) => {
    const top = broken ? 4 : 0;
    for (let y = top; y < h; y++) for (let x = 3; x < w - 3; x++) {
      if (broken && y < top + 4 && hash2(x, y, 3) > 0.4 + (y - top) * 0.15) continue;
      const f = (x - 3) / (w - 7);
      p.px(x, y, f < 0.2 ? r[3] : f > 0.75 ? r[1] : (x % 3 === 0 ? r[1] : r[2]));
    }
    if (!broken) { p.rect(1, 0, w - 2, 4, r[2]); p.rect(1, 0, w - 2, 1, r[4]); p.rect(1, 3, w - 2, 1, r[0]); }
    p.rect(1, h - 4, w - 2, 4, r[2]); p.rect(1, h - 4, w - 2, 1, r[3]);
    for (let y = 0; y < h; y += 9) p.line(3, y + 6, w - 4, y + 6, r[0]);
    for (let i = 0; i < 10; i++) { const x = 3 + hash2(i, 1, 8) * (w - 7) | 0, y = hash2(i, 2, 8) * h | 0; if (p.solid(x, y)) { p.px(x, y, moss); p.px(x, y + 1, mix(moss, 0, 0.3)); } }
    p.outline(OUT);
  };
}

const statue = (r: Ramp, moss: number): Painter => (p) => {
  p.rect(6, 40, 28, 8, r[2]); p.rect(6, 40, 28, 1, r[4]); p.rect(6, 47, 28, 1, r[0]);
  p.limb(14, 40, 16, 24, 6, 5, r); // body
  p.limb(17, 24, 24, 12, 3.5, 2.5, r); // neck
  p.ball(27, 9, 5, 3.5, r); p.limb(29, 10, 35, 11, 2.2, 1.4, r); // head + snout
  p.limb(24, 6, 19, 1, 1.4, 0.6, r); p.limb(27, 6, 24, 1, 1.2, 0.5, r); // horns
  p.poly([[13, 24], [2, 8], [5, 22], [1, 26], [8, 30]], r[1]); p.line(13, 24, 2, 8, r[3]); // folded wing
  p.limb(12, 38, 4, 38, 2.5, 1, r); p.px(28, 8, 0x8ff0e0); p.px(29, 8, 0x8ff0e0);
  for (let i = 0; i < 18; i++) { const x = hash2(i, 1, 4) * 40 | 0, y = hash2(i, 2, 4) * 48 | 0; if (p.solid(x, y) && !p.solid(x, y - 1)) { p.px(x, y, moss); p.px(x, y + 1, mix(moss, 0, 0.3)); } }
  p.outline(OUT);
};

const arch = (r: Ramp, moss: number): Painter => (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 32, (y - 34) * 0.95);
    const inPillar = (x >= 4 && x < 16) || (x >= 48 && x < 60);
    if ((y < 34 && d < 30 && d > 17) || (y >= 34 && inPillar)) {
      const row = Math.floor(y / 6), lx = (x + (row % 2) * 5) % 10;
      let c = hash2(Math.floor((x + (row % 2) * 5) / 10), row, 2) > 0.6 ? r[1] : r[2];
      if (y % 6 === 5 || lx === 9) c = r[0]; else if (y % 6 === 0) c = r[3];
      if (hash2(x, y, 5) > 0.985 && y < 20) continue;
      p.px(x, y, c);
    }
  }
  for (let x = 0; x < 64; x++) for (let y = 0; y < 30; y++) if (p.solid(x, y) && !p.solid(x, y - 1) && hash2(x >> 1, 1, 6) > 0.35) { p.px(x, y, mix(moss, 0xffffff, 0.2)); p.px(x, y + 1, moss); if (hash2(x, 2, 6) > 0.7) p.px(x, y + 2, moss); }
  p.outline(OUT);
};

const chest = (open: boolean): Painter => (p) => {
  const w = ramp(0x8a5a34), m = ramp(0xe0b040);
  p.rect(1, 6, 16, 8, w[2]); p.rect(1, 6, 16, 1, w[3]); p.rect(1, 13, 16, 1, w[0]); p.rect(1, 6, 1, 8, m[2]); p.rect(16, 6, 1, 8, m[1]);
  if (open) { p.rect(1, 0, 16, 3, w[1]); p.rect(1, 0, 16, 1, m[2]); p.rect(2, 3, 14, 3, 0x2a1a20); p.rect(4, 4, 10, 2, 0xffe680); p.px(6, 3, 0xffffff); p.px(11, 3, 0xffffff); }
  else { p.rect(1, 2, 16, 4, w[3]); p.rect(1, 2, 16, 1, m[3]); p.rect(1, 5, 16, 1, m[1]); }
  p.rect(8, 7, 2, 3, m[3]); p.outline(OUT);
};

const boatSide: Painter = (p) => {
  const w = ramp(0x9a6238), s = ramp(0xf0e6d0);
  p.poly([[4, 34], [60, 34], [54, 44], [10, 44]], w[2]);
  p.poly([[4, 34], [60, 34], [59, 36], [5, 36]], w[4]); p.line(8, 40, 56, 40, w[1]); p.line(10, 44, 54, 44, w[0]);
  p.poly([[60, 34], [63, 30], [60, 36]], w[3]);
  p.rect(30, 2, 2, 32, w[1]); p.rect(30, 2, 1, 32, w[3]);
  p.poly([[33, 4], [54, 26], [33, 28]], s[2]); p.poly([[33, 4], [38, 9], [33, 9]], s[4]);
  p.line(33, 28, 54, 26, s[1]); p.line(36, 16, 44, 17, 0xe4533c); p.line(36, 18, 46, 19, 0xe4533c);
  p.poly([[29, 8], [14, 27], [29, 28]], s[3]); p.line(29, 28, 14, 27, s[1]);
  p.outline(OUT);
};

const crystal = (r: Ramp): Painter => (p) => {
  const sh = (x: number, w: number, h: number): void => { p.poly([[x, 20], [x - w, 20 - h * 0.3], [x, 20 - h], [x + w, 20 - h * 0.35]], r[2]); p.poly([[x, 20], [x - w, 20 - h * 0.3], [x, 20 - h]], r[4]); p.line(x, 20, x, 20 - h, r[3]); p.poly([[x + 1, 20], [x + w, 20 - h * 0.35], [x + 1, 20 - h * 0.5]], r[1]); };
  sh(4, 2.5, 11); sh(10, 2.5, 13); sh(7, 3.5, 19); p.outline(OUT);
};

const stal = (r: Ramp, down: boolean, h: number): Painter => (p) => {
  for (let y = 0; y < h; y++) { const t = down ? y / h : 1 - y / h, w = Math.max(0.6, 4.5 * (1 - t) ** 1.3); for (let x = -w; x <= w; x++) p.px(5 + x, y, x < -w * 0.3 ? r[3] : x > w * 0.4 ? r[1] : r[2]); }
  p.outline(OUT);
};

const vine = (r: Ramp, h: number, seed: number): Painter => (p) => {
  for (let y = 0; y < h; y++) { const x = 4 + Math.sin(y / 5 + seed) * 1.6; p.px(x, y, r[1]); if (y % 4 === 1) { const s = (y >> 2) % 2 ? 1 : -1; p.px(x + s, y, r[3]); p.px(x + s * 2, y, r[2]); p.px(x + s, y + 1, r[2]); } }
  p.px(4, h - 2, r[4]);
};

const flower = (c: number): Painter => (p) => { const g = ramp(0x4f9a3c); p.line(4, 9, 4, 4, g[1]); p.px(3, 7, g[2]); p.px(5, 6, g[2]); p.rect(3, 1, 3, 3, c); p.px(4, 2, 0xffe680); p.px(4, 0, mix(c, 0xffffff, 0.4)); p.px(2, 2, mix(c, 0xffffff, 0.3)); p.px(6, 2, shade(c, -0.2)); };
const grassTuft = (r: Ramp, seed: number): Painter => (p) => { for (let i = 0; i < 9; i++) { const x = 1 + i * 1.6, h = 3 + hash2(i, 1, seed) * 5, l = (hash2(i, 2, seed) - 0.5) * 3; p.line(x, 8, x + l, 8 - h, i % 3 === 0 ? r[3] : i % 3 === 1 ? r[2] : r[1]); } };
const fern = (r: Ramp): Painter => (p) => { for (let k = 0; k < 5; k++) { const a = 0.4 + k * 0.58; for (let s = 0; s < 8; s++) { const x = 8 + Math.cos(a) * s, y = 11 - Math.sin(a) * s + s * s * 0.06; p.px(x, y, r[2]); if (s % 2) { p.px(x, y - 1, r[3]); p.px(x, y + 1, r[1]); } } } p.outline(OUT); };
const mushroom = (c: number): Painter => (p) => { p.rect(4, 5, 2, 5, 0xe8e0d0); p.rect(5, 5, 1, 5, 0xb0a8a0); const r = ramp(c); p.ball(4.5, 3.5, 4.5, 3, r); p.px(3, 2, 0xffffff); p.px(6, 4, r[4]); p.rect(1, 6, 8, 1, r[0]); p.erase(0, 6); p.erase(9, 6); p.outline(OUT); };
const totem = (r: Ramp): Painter => (p) => { p.rect(3, 2, 10, 38, r[2]); p.rect(3, 2, 2, 38, r[3]); p.rect(11, 2, 2, 38, r[1]); for (let k = 0; k < 3; k++) { const y = 4 + k * 12; p.rect(1, y + 8, 14, 2, r[1]); p.rect(5, y + 2, 2, 2, 0x8ff0e0); p.rect(9, y + 2, 2, 2, 0x8ff0e0); p.line(5, y + 6, 10, y + 6, r[0]); } p.poly([[3, 2], [0, 0], [3, 6]], r[3]); p.poly([[12, 2], [15, 0], [12, 6]], r[1]); p.outline(OUT); };
const brazier = (r: Ramp): Painter => (p) => { p.rect(7, 8, 2, 10, r[1]); p.rect(4, 17, 8, 2, r[2]); p.poly([[2, 4], [13, 4], [11, 9], [4, 9]], r[2]); p.line(2, 4, 13, 4, r[4]); p.line(4, 9, 11, 9, r[0]); p.outline(OUT); };
const campfire: Painter = (p) => { const w = ramp(0x7a4a2c), s = ramp(0x777788); p.limb(3, 8, 16, 5, 1.6, 1.6, w); p.limb(4, 5, 17, 8, 1.6, 1.6, w); for (const x of [1, 6, 13, 18]) p.ball(x, 9, 1.8, 1.4, s); p.outline(OUT); };
const sign = (r: Ramp): Painter => (p) => { p.rect(6, 6, 2, 12, r[1]); p.rect(1, 1, 12, 7, r[2]); p.rect(1, 1, 12, 1, r[4]); p.rect(1, 7, 12, 1, r[0]); p.line(3, 3, 10, 3, r[0]); p.line(3, 5, 8, 5, r[0]); p.outline(OUT); };
const nest: Painter = (p) => { const r = ramp(0x8a6a3a); for (let i = 0; i < 40; i++) { const x = 2 + hash2(i, 1, 1) * 28, y = 4 + hash2(i, 2, 1) * 7; p.line(x - 3, y + hash2(i, 3, 1) * 2, x + 3, y - hash2(i, 4, 1) * 2, r[1 + (i % 3)]); } p.outline(OUT); };
const egg = (c: number): Painter => (p) => { const r = ramp(c); p.ball(4.5, 6.5, 4, 5.5, r); p.px(3, 5, r[0]); p.px(6, 8, r[0]); p.px(5, 3, r[0]); p.outline(OUT); };
const crate: Painter = (p) => { const r = ramp(0x9a6a3e); p.rect(0, 0, 14, 14, r[2]); p.rect(0, 0, 14, 2, r[3]); p.rect(0, 12, 14, 2, r[1]); p.rect(0, 0, 2, 14, r[3]); p.rect(12, 0, 2, 14, r[1]); p.line(2, 2, 11, 11, r[1]); p.line(11, 2, 2, 11, r[1]); p.outline(OUT); };
const trap: Painter = (p) => { const r = ramp(0x8a7a5a), m = ramp(0x777a88); for (let i = 0; i <= 6; i++) { p.line(2 + i * 5, 2, 2 + i * 5 + (i - 3), 22, r[2]); p.line(2, 2 + i * 3.3, 32, 2 + i * 3.3 + Math.sin(i) * 1.5, r[1]); } p.rect(0, 20, 4, 4, m[2]); p.rect(30, 20, 4, 4, m[2]); p.px(1, 21, m[4]); p.px(31, 21, m[4]); };
// ── village & hunters' camp ─────────────────────────────────────────────
const planks = (p: Pix, x0: number, y0: number, w: number, h: number, r: Ramp, seed: number): void => {
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { const col = Math.floor(x / 4), edge = x % 4 === 3; p.px(x0 + x, y0 + y, edge ? r[0] : hash2(col, Math.floor(y / 9), seed) > 0.7 ? r[1] : x % 4 === 0 ? r[3] : r[2]); }
};
const roof = (p: Pix, cx: number, top: number, half: number, eave: number, r: Ramp, turf: boolean): void => {
  for (let y = top; y <= eave; y++) { const w = ((y - top) / (eave - top)) * half; for (let x = -w; x <= w; x++) { const n = hash2(Math.round(cx + x), y, 3); p.px(cx + x, y, y === eave ? r[0] : x < -w + 2 ? r[3] : turf && n > 0.86 ? r[4] : (Math.round(x + y * 0.5) % 5 === 0 ? r[1] : r[2])); } }
  if (turf) for (let x = -half; x <= half; x += 2) p.px(cx + x, eave + 1, 0x4f9a3c);
};
const dragonGable = (p: Pix, x: number, y: number, dir: number, c: number): void => { p.limb(x, y, x + dir * 4, y - 6, 1.4, 1.2, c); p.limb(x + dir * 4, y - 6, x + dir * 7, y - 6, 1.6, 0.8, c); p.px(x + dir * 6, y - 7, 0xf2c14e); };
const house = (wall: number, roofC: number, door: number, seed: number): Painter => (p) => {
  const w = ramp(wall), r = ramp(roofC), st = ramp(0x777a88), d = ramp(door);
  p.rect(4, 56, 64, 8, st[2]); for (let x = 4; x < 68; x += 7) p.line(x, 56, x, 63, st[1]); p.rect(4, 56, 64, 1, st[3]);
  planks(p, 8, 30, 56, 26, w, seed);
  roof(p, 36, 4, 34, 32, r, true);
  dragonGable(p, 36, 6, 1, w[1]); dragonGable(p, 36, 6, -1, w[1]);
  p.line(10, 32, 62, 32, w[0]); p.line(8, 33, 64, 33, w[1]);
  p.rect(30, 38, 13, 18, d[1]); p.rect(31, 39, 11, 17, d[2]); p.line(36, 39, 36, 55, d[0]); for (const yy of [42, 50]) { p.px(32, yy, 0x9a9aa8); p.px(40, yy, 0x9a9aa8); }
  p.ellipse(18, 42, 4, 4, w[0]); p.ellipse(18, 42, 3, 3, 0xffc860); p.px(17, 41, 0xfff0b0); p.line(15, 42, 21, 42, w[0]); p.line(18, 39, 18, 45, w[0]);
  p.rect(50, 38, 8, 7, w[0]); p.rect(51, 39, 6, 5, 0xffc860); p.px(52, 40, 0xfff0b0);
  p.rect(56, 12, 5, 12, st[1]); p.rect(56, 12, 5, 1, st[3]);
  p.outline(OUT);
};
const longhouse: Painter = (p) => {
  const w = ramp(0x8a5a34), r = ramp(0x6a5a3a), st = ramp(0x777a88), d = ramp(0x5a3a24);
  p.rect(2, 70, 136, 10, st[2]); for (let x = 2; x < 138; x += 8) p.line(x, 70, x, 79, st[1]); p.rect(2, 70, 136, 1, st[3]);
  planks(p, 8, 40, 124, 30, w, 9);
  roof(p, 70, 2, 70, 42, r, true);
  dragonGable(p, 70, 4, 1, w[1]); dragonGable(p, 70, 4, -1, w[1]);
  p.rect(58, 46, 24, 24, d[1]); p.rect(59, 47, 22, 23, d[2]); p.line(70, 47, 70, 69, d[0]); p.poly([[56, 46], [70, 40], [84, 46]], w[3]);
  const shield = (x: number, c: number): void => { const s2 = ramp(c); p.ball(x, 54, 6, 6, s2); p.line(x - 6, 54, x + 6, 54, s2[0]); p.line(x, 48, x, 60, s2[0]); p.ball(x, 54, 1.5, 1.5, ramp(0xc0c0c8)); };
  [20, 36, 104, 120].forEach((x, i) => shield(x, [0xc8463a, 0x3f6fc8, 0xd8a030, 0x3f9a58][i]));
  p.outline(OUT);
};
const stall = (awn: number, goods: 'fish' | 'fruit' | 'maps' | 'tools'): Painter => (p) => {
  const w = ramp(0x9a6a3e), a = ramp(awn);
  p.rect(3, 6, 2, 38, w[1]); p.rect(39, 6, 2, 38, w[1]);
  for (let x = 0; x < 44; x++) for (let y = 2; y < 10; y++) p.px(x, y, Math.floor(x / 5) % 2 ? a[2] : 0xf0e8d8);
  for (let x = 0; x < 44; x += 5) p.poly([[x, 10], [x + 5, 10], [x + 2.5, 13]], Math.floor(x / 5) % 2 ? a[1] : 0xd8d0c0);
  p.rect(1, 28, 42, 14, w[2]); p.rect(1, 28, 42, 2, w[4]); p.rect(1, 41, 42, 1, w[0]); for (let x = 5; x < 42; x += 8) p.line(x, 30, x, 40, w[1]);
  if (goods === 'fish') for (let k = 0; k < 5; k++) { const f = ramp([0x5fa8d0, 0x8ab0c0, 0xd89a6a][k % 3]); p.ball(6 + k * 8, 25, 3.5, 2, f); p.px(3 + k * 8, 25, f[0]); }
  else if (goods === 'fruit') for (let k = 0; k < 4; k++) { p.ball(7 + k * 10, 25, 4.5, 3, ramp(0x9a7a4a)); for (let j = 0; j < 3; j++) p.ball(5 + k * 10 + j * 2, 22, 1.6, 1.6, ramp([0xd03a6a, 0xf0a020, 0x8ad040][k % 3])); }
  else if (goods === 'maps') { for (let k = 0; k < 4; k++) { p.rect(5 + k * 9, 21, 7, 6, 0xe8d8a8); p.line(6 + k * 9, 23, 10 + k * 9, 24, 0x9a6a3e); } p.ball(38, 22, 3, 3, ramp(0x4fd6c0)); }
  else { p.line(6, 26, 14, 18, 0xc0c0c8); p.line(20, 26, 20, 16, 0x9a6a3e); p.rect(18, 15, 5, 3, 0x8a8a9a); p.ball(32, 24, 4, 3, ramp(0x8a8a9a)); }
  p.outline(OUT);
};
const forge: Painter = (p) => {
  const st = ramp(0x6a6a78), m = ramp(0x5a5a64);
  p.rect(6, 14, 30, 30, st[2]); for (let y = 14; y < 44; y += 5) for (let x = 6 + ((y / 5) % 2) * 4; x < 36; x += 8) p.rect(x, y, 7, 4, st[(x + y) % 3 === 0 ? 1 : 3]);
  p.rect(26, 0, 8, 14, st[1]); p.rect(26, 0, 8, 2, st[3]);
  p.ellipse(21, 32, 7, 6, 0x2a1414); p.ellipse(21, 33, 5, 4, 0xf2742e); p.ellipse(21, 34, 3, 2, 0xffe680);
  p.rect(38, 34, 12, 4, m[3]); p.rect(41, 38, 6, 6, m[1]); p.rect(37, 34, 2, 2, m[2]); p.outline(OUT);
};
const tower: Painter = (p) => {
  const w = ramp(0x8a5a34);
  for (const x of [4, 22]) { p.rect(x, 26, 3, 70, w[1]); p.rect(x, 26, 1, 70, w[3]); }
  for (let y = 34; y < 96; y += 14) { p.line(5, y, 23, y + 10, w[0]); p.line(23, y, 5, y + 10, w[0]); }
  for (let y = 40; y < 96; y += 5) p.line(10, y, 16, y, w[2]);
  p.rect(0, 22, 28, 6, w[2]); p.rect(0, 22, 28, 1, w[4]); roof(p, 14, 2, 16, 18, ramp(0x6a4a3a), false);
  p.rect(2, 18, 2, 4, w[1]); p.rect(24, 18, 2, 4, w[1]); p.outline(OUT);
};
const stable: Painter = (p) => {
  const w = ramp(0x7a4a2e), r = ramp(0x8a6a3a);
  planks(p, 4, 22, 88, 36, w, 4);
  for (let y = 26; y < 58; y++) for (let x = 24; x < 72; x++) { const dx = (x - 48) / 24, dy = (y - 58) / 32; if (dx * dx + dy * dy < 1) p.px(x, y, y > 50 ? 0xc8a050 : 0x2a1a14); }
  roof(p, 48, 0, 48, 24, r, false); dragonGable(p, 48, 2, 1, w[3]); dragonGable(p, 48, 2, -1, w[3]);
  for (let k = 0; k < 4; k++) p.ball(30 + k * 11, 55, 4, 2.5, ramp(0xd8b050)); p.outline(OUT);
};
const well: Painter = (p) => { const st = ramp(0x777a88), w = ramp(0x8a5a34); p.ellipse(12, 22, 10, 4, st[1]); p.rect(2, 18, 20, 9, st[2]); p.rect(2, 18, 20, 1, st[4]); p.rect(3, 4, 2, 14, w[1]); p.rect(19, 4, 2, 14, w[1]); p.poly([[0, 5], [12, 0], [24, 5]], ramp(0x6a4a3a)[2]); p.line(12, 5, 12, 15, 0x9a8a7a); p.rect(10, 14, 4, 3, w[2]); p.outline(OUT); };
const board: Painter = (p) => { const w = ramp(0x8a5a34); p.rect(3, 10, 2, 18, w[1]); p.rect(19, 10, 2, 18, w[1]); p.rect(0, 2, 24, 14, w[2]); p.rect(0, 2, 24, 1, w[4]); [[3, 4, 0xf0e6d0], [10, 5, 0xe8d8a8], [16, 4, 0xf0e6d0], [6, 10, 0xe8d8a8]].forEach(([x, y, c]) => { p.rect(x, y, 6, 5, c); p.px(x + 2, y, 0xc8463a); }); p.outline(OUT); };
const lamp: Painter = (p) => { p.rect(3, 8, 2, 22, 0x3a3040); p.rect(1, 2, 6, 7, 0x3a3040); p.rect(2, 3, 4, 5, 0xffc860); p.px(3, 4, 0xfff0b0); p.outline(OUT); };
const barrels: Painter = (p) => { for (const [x, y] of [[2, 6], [12, 6], [7, 0]] as const) { const r = ramp(0x8a5a34); p.ball(x + 5, y + 6, 5, 6, r); p.line(x, y + 3, x + 10, y + 3, 0x5a5a64); p.line(x, y + 9, x + 10, y + 9, 0x5a5a64); } p.outline(OUT); };
const fence: Painter = (p) => { const w = ramp(0x8a5a34); for (let x = 1; x < 32; x += 8) { p.rect(x, 0, 3, 14, w[2]); p.rect(x, 0, 1, 14, w[3]); } p.rect(0, 4, 32, 2, w[1]); p.rect(0, 9, 32, 2, w[1]); p.outline(OUT); };
const cart: Painter = (p) => { const w = ramp(0x9a6a3e); p.rect(2, 4, 30, 10, w[2]); p.rect(2, 4, 30, 1, w[4]); for (let k = 0; k < 3; k++) p.ball(8 + k * 9, 4, 3.5, 2.5, ramp([0xd03a6a, 0xf0a020, 0x5fa8d0][k])); for (const x of [8, 26]) { p.ellipse(x, 16, 5, 5, w[0]); p.ellipse(x, 16, 3, 3, w[2]); p.px(x, 16, w[0]); } p.line(32, 10, 36, 12, w[1]); p.outline(OUT); };
const hay: Painter = (p) => { const r = ramp(0xd8b050); p.ball(9, 6, 8, 4, r); for (let k = 0; k < 9; k++) p.line(2 + k * 1.8, 6, 3 + k * 1.8, 2, r[3]); p.outline(OUT); };
const tent: Painter = (p) => { const c = ramp(0x6a2a24); p.poly([[2, 33], [24, 1], [46, 33]], c[2]); p.poly([[2, 33], [24, 1], [18, 33]], c[3]); p.poly([[19, 33], [24, 14], [29, 33]], 0x1a1014); p.line(24, 1, 24, -2, 0x3a3040); p.outline(OUT); };
const cage: Painter = (p) => { const m = ramp(0x5a5a64); p.rect(0, 0, 34, 3, m[2]); p.rect(0, 27, 34, 3, m[1]); for (let x = 1; x < 34; x += 4) p.rect(x, 0, 2, 30, m[x % 8 === 1 ? 3 : 2]); p.outline(OUT); };
const palisade: Painter = (p) => { const w = ramp(0x6a4a2e); for (let x = 0; x < 16; x += 5) { p.rect(x, 6, 5, 34, w[2]); p.rect(x, 6, 1, 34, w[3]); p.poly([[x, 6], [x + 2.5, 0], [x + 5, 6]], w[3]); } p.rect(0, 20, 16, 2, w[0]); p.outline(OUT); };
const hunterBanner: Painter = (p) => { p.rect(1, 0, 2, 40, 0x3a3040); p.rect(3, 2, 9, 22, 0x1a1418); p.poly([[3, 24], [12, 24], [7.5, 29]], 0x1a1418); for (let k = 0; k < 3; k++) p.line(5 + k * 2, 8, 6 + k * 2, 18, 0xc02020); p.outline(OUT); };
const anchor: Painter = (p) => { const m = ramp(0x6a6a78); p.rect(4, 8, 12, 16, m[2]); p.rect(4, 8, 12, 2, m[4]); p.rect(2, 22, 16, 3, m[1]); p.ellipse(10, 6, 5, 5, m[3]); p.ellipse(10, 6, 2.5, 2.5, 0); for (let y = 3; y < 9; y++) for (let x = 8; x < 13; x++) if (Math.hypot(x - 10, y - 6) < 2.6) p.erase(x, y); p.outline(OUT); };
const netPile: Painter = (p) => { const r = ramp(0x8a7a5a); for (let k = 0; k < 7; k++) p.line(2 + k * 3, 10, 6 + k * 2.4, 1 + (k % 3), r[1 + (k % 3)]); p.ball(12, 9, 10, 3, r); p.outline(OUT); };

/** Riding saddle: quilted blanket + leather seat with a raised pommel, sits on the dragon's back. */
const saddle: Painter = (p) => {
  const bl = ramp(0xc8463a), le = ramp(0x8a5a34), go = ramp(0xf2c14e);
  p.poly([[1, 5], [17, 5], [16, 10], [2, 10]], bl[2]); p.line(1, 5, 17, 5, bl[4]); p.line(2, 10, 16, 10, bl[0]);
  for (let x = 3; x < 16; x += 3) p.px(x, 8, go[3]);
  p.poly([[4, 6], [14, 6], [13, 3], [11, 4], [7, 4], [5, 2]], le[2]); p.line(5, 2, 7, 4, le[4]); p.line(7, 4, 11, 4, le[3]); p.line(4, 6, 14, 6, le[0]);
  p.rect(13, 2, 2, 2, le[3]); p.px(13, 1, go[3]); p.line(9, 6, 9, 10, le[1]); p.px(9, 9, go[4]);
  p.outline(OUT);
};
const relic: Painter = (p) => { const r = ramp(0x4fd6c0); p.poly([[5, 0], [9, 5], [6, 11], [2, 8], [1, 3]], r[2]); p.poly([[5, 0], [5, 6], [1, 3]], r[4]); p.poly([[6, 11], [9, 5], [5, 6]], r[1]); p.outline(0x0a3a40); };
const deadTree = (r: Ramp): Painter => (p) => { p.limb(20, 55, 19, 22, 4, 2.2, r); p.limb(19, 30, 8, 14, 1.8, 0.8, r); p.limb(19, 24, 30, 8, 1.8, 0.8, r); p.limb(12, 20, 6, 22, 1, 0.5, r); p.limb(26, 14, 34, 16, 1, 0.5, r); p.limb(19, 22, 18, 6, 1.6, 0.6, r); p.limb(20, 55, 13, 55, 2, 1, r); p.limb(20, 55, 28, 55, 2, 1, r); p.px(18, 40, 0xf2742e); p.px(19, 41, 0xffd27a); p.outline(OUT); };
const spire = (r: Ramp, h: number): Painter => (p) => { p.poly([[10, 0], [17, h], [2, h]], r[2]); p.poly([[10, 0], [8, h], [2, h]], r[3]); p.poly([[10, 0], [9, h * 0.6], [6, h * 0.5]], r[4]); p.poly([[5, h * 0.5], [9, h], [0, h]], r[1]); p.outline(OUT); };
const bones: Painter = (p) => { const r = ramp(0xd8d0c0); for (let i = 0; i < 5; i++) { const x = 4 + i * 4; for (let s = 0; s < 8; s++) p.px(x + s * 0.3, 9 - Math.sin(s / 7 * 3.14) * (7 - i), r[2 + (s < 3 ? 1 : 0)]); } p.line(2, 9, 23, 9, r[1]); p.outline(OUT); };
const pine = (th: Theme): Painter => (p) => { const t = th.trunk, l = th.leaf; let px = 16, py = 71; for (let i = 1; i <= 10; i++) { const x = 16 + i * i * 0.2, y = 71 - i * 6; p.limb(px, py, x, y, 3 - i * 0.2, 2.8 - i * 0.2, t); px = x; py = y; } for (let k = 0; k < 6; k++) { const y = 14 + k * 8, x = 16 + ((71 - y) / 6) ** 2 * 0.2, len = 8 + k * 2.6; for (let s = 0; s < len; s++) { const h = 2 + (1 - s / len) * 3; for (let j = 0; j < h; j++) p.px(x + s + 2, y + j - s * 0.15, j === 0 ? l[3] : j > h - 2 ? l[1] : l[2]); } for (let s = 0; s < len * 0.35; s++) p.px(x - s, y + 2, l[1]); } p.outline(OUT); };
const stone = (r: Ramp): Painter => (p) => { p.poly([[4, 35], [3, 6], [7, 0], [12, 3], [13, 35]], r[2]); p.poly([[4, 35], [3, 6], [7, 0], [6, 35]], r[3]); p.poly([[11, 35], [12, 3], [13, 35]], r[1]); for (const [x, y] of [[8, 8], [7, 14], [9, 20], [8, 26]] as const) { p.px(x, y, 0x9ff0ff); p.px(x + 1, y + 1, 0x5fc0e0); p.px(x - 1, y + 1, 0x5fc0e0); } p.outline(OUT); };
const cairn = (r: Ramp): Painter => (p) => { p.ball(7, 11, 6, 3, r); p.ball(7, 7, 4.5, 2.5, r); p.ball(7, 3.5, 3, 2, r); p.outline(OUT); };
const basalt = (r: Ramp): Painter => (p) => { for (let i = 0; i < 6; i++) { const h = 14 + hash2(i, 1, 5) * 24, x = 1 + i * 5; p.rect(x, 40 - h, 5, h, r[2]); p.rect(x, 40 - h, 1, h, r[3]); p.rect(x + 4, 40 - h, 1, h, r[0]); p.rect(x, 40 - h, 5, 1, r[4]); } p.outline(OUT); };
const driftwood: Painter = (p) => { const r = ramp(0xb09a80); p.limb(2, 6, 21, 4, 1.8, 1.3, r); p.limb(12, 5, 16, 1, 1, 0.5, r); p.outline(OUT); };
const shell: Painter = (p) => { const r = ramp(0xf0b8a0); p.ball(4, 3.5, 3.5, 2.5, r); p.line(2, 2, 4, 5, r[1]); p.line(5, 1, 5, 5, r[1]); p.outline(OUT); };
const herb: Painter = (p) => { const g = ramp(0x4fbf7a); p.line(5, 9, 5, 3, g[1]); p.limb(5, 6, 2, 3, 1, 0.5, g); p.limb(5, 5, 8, 2, 1, 0.5, g); p.limb(5, 3, 5, 0, 1, 0.5, g); p.px(5, 0, 0xffffff); p.outline(OUT); };
const lavaVent: Painter = (p) => { const r = ramp(0x4b3d48); p.poly([[0, 8], [4, 2], [12, 2], [16, 8]], r[2]); p.line(4, 2, 12, 2, r[4]); p.rect(5, 3, 6, 2, 0xf2742e); p.rect(6, 3, 4, 1, 0xffd27a); p.outline(OUT); };

/** Radial light sprites (used with additive blending). */
const light = (size: number): Painter => (p) => p.glow(size / 2, size / 2, size / 2, 0xffffff, 0.9, 16);

export function propDefs(): Record<string, PropDef> {
  const T = THEMES.tropical, V = THEMES.volcanic, S = THEMES.storm;
  const d: Record<string, PropDef> = {
    tree1: { w: 80, h: 96, paint: tree(T, 80, 96, 1) }, tree2: { w: 64, h: 80, paint: tree(T, 64, 80, 2) },
    palm1: { w: 56, h: 80, paint: palm(T, 56, 80, 1, 1) }, palm2: { w: 48, h: 64, paint: palm(T, 48, 64, -1, 2) },
    bush1: { w: 26, h: 16, paint: bush(T.leaf, 26, 16, 1) }, bush2: { w: 34, h: 20, paint: bush(T.leaf2, 34, 20, 2) },
    berrybush: { w: 26, h: 18, paint: bush(T.leaf, 26, 18, 3, 0xd03a6a) }, berrybush_empty: { w: 26, h: 18, paint: bush(T.leaf, 26, 18, 3) },
    fern: { w: 18, h: 13, paint: fern(T.leaf) }, flower_red: { w: 9, h: 10, paint: flower(0xe4533c) }, flower_blue: { w: 9, h: 10, paint: flower(0x6f8fe6) }, flower_white: { w: 9, h: 10, paint: flower(0xf0f0e0) },
    grass1: { w: 16, h: 9, paint: grassTuft(T.top, 1) }, grass2: { w: 16, h: 9, paint: grassTuft(T.top, 2) },
    rock1: { w: 26, h: 16, paint: rock(T.rock, 26, 15, 1, T.moss) }, rock2: { w: 16, h: 10, paint: rock(T.rock, 16, 9, 2) }, rock3: { w: 44, h: 30, paint: rock(T.rock, 44, 29, 3, T.moss) },
    driftwood: { w: 24, h: 9, paint: driftwood }, shell: { w: 9, h: 7, paint: shell }, herb: { w: 11, h: 11, paint: herb },
    vine1: { w: 9, h: 48, paint: vine(T.leaf, 48, 1) }, vine2: { w: 9, h: 32, paint: vine(T.leaf2, 32, 2) },
    shroom: { w: 10, h: 11, paint: mushroom(0x5fd6e6) }, pillar: { w: 16, h: 48, paint: column(T.ruin, 16, 48, false, T.moss) }, pillar_broken: { w: 16, h: 28, paint: column(T.ruin, 16, 28, true, T.moss) },
    arch: { w: 64, h: 66, paint: arch(T.ruin, T.moss) }, statue: { w: 40, h: 49, paint: statue(T.ruin, T.moss) }, totem: { w: 16, h: 41, paint: totem(T.wood) },
    brazier: { w: 16, h: 20, paint: brazier(ramp(0x6a6a7a)) }, chest: { w: 18, h: 15, paint: chest(false) }, chest_open: { w: 18, h: 15, paint: chest(true) },
    campfire: { w: 20, h: 12, paint: campfire }, sign: { w: 14, h: 19, paint: sign(T.wood) }, nest: { w: 32, h: 13, paint: nest }, egg: { w: 10, h: 13, paint: egg(0xe8d8b0) },
    crate: { w: 15, h: 15, paint: crate }, trap: { w: 34, h: 25, paint: trap }, relic: { w: 11, h: 13, paint: relic }, boat_side: { w: 64, h: 46, paint: boatSide },
    stalactite: { w: 11, h: 20, paint: stal(T.rock, true, 20) }, stalagmite: { w: 11, h: 16, paint: stal(T.rock, false, 16) },
    crystal: { w: 15, h: 22, paint: crystal(ramp(0x6fe0d6)) }, crystal_fire: { w: 15, h: 22, paint: crystal(ramp(0xf2742e)) }, crystal_storm: { w: 15, h: 22, paint: crystal(ramp(0x9a8af0)) },
    deadtree: { w: 40, h: 57, paint: deadTree(V.trunk) }, spire: { w: 20, h: 41, paint: spire(ramp(0x3a3048), 40) }, spire_small: { w: 20, h: 25, paint: spire(ramp(0x3a3048), 24) },
    bones: { w: 26, h: 11, paint: bones }, basalt: { w: 32, h: 41, paint: basalt(V.rock) }, lavavent: { w: 17, h: 9, paint: lavaVent },
    vrock: { w: 30, h: 20, paint: rock(V.rock, 30, 19, 7, 0xd0622a) }, emberbush: { w: 26, h: 16, paint: bush(V.leaf, 26, 16, 5, 0xffb347) },
    pine: { w: 56, h: 73, paint: pine(S) }, standing_stone: { w: 16, h: 37, paint: stone(S.rock) }, cairn: { w: 15, h: 15, paint: cairn(S.rock) },
    heather: { w: 26, h: 14, paint: bush(ramp(0x7a6aa8), 26, 14, 9, 0xd0b0ff) }, sgrass: { w: 16, h: 9, paint: grassTuft(S.top, 5) }, srock: { w: 34, h: 22, paint: rock(S.rock, 34, 21, 8, S.moss) },
    saddle: { w: 18, h: 11, paint: saddle },
    house_a: { w: 72, h: 64, paint: house(0x9a6a3e, 0x6a5a3a, 0x6a3a24, 1) }, house_b: { w: 72, h: 64, paint: house(0x7a5a4a, 0x5a6a4a, 0x3f55a0, 2) }, house_c: { w: 72, h: 64, paint: house(0xa88050, 0x7a4a3a, 0x8a2e3a, 3) },
    longhouse: { w: 140, h: 80, paint: longhouse }, stable: { w: 96, h: 58, paint: stable }, forge: { w: 52, h: 44, paint: forge }, tower: { w: 28, h: 96, paint: tower },
    stall_fish: { w: 44, h: 44, paint: stall(0x3f6fc8, 'fish') }, stall_fruit: { w: 44, h: 44, paint: stall(0x3f9a58, 'fruit') }, stall_maps: { w: 44, h: 44, paint: stall(0xb8552e, 'maps') }, stall_tools: { w: 44, h: 44, paint: stall(0x6a6a78, 'tools') },
    well: { w: 24, h: 27, paint: well }, board: { w: 24, h: 28, paint: board }, lamp: { w: 8, h: 30, paint: lamp }, barrels: { w: 22, h: 18, paint: barrels }, fence: { w: 32, h: 14, paint: fence },
    cart: { w: 37, h: 22, paint: cart }, hay: { w: 18, h: 10, paint: hay }, tent: { w: 48, h: 34, paint: tent }, cage: { w: 34, h: 30, paint: cage }, palisade: { w: 16, h: 40, paint: palisade },
    banner_hunter: { w: 12, h: 40, paint: hunterBanner }, anchor: { w: 20, h: 25, paint: anchor }, netpile: { w: 24, h: 12, paint: netPile },
    light64: { w: 64, h: 64, paint: light(64) }, light128: { w: 128, h: 128, paint: light(128) },
  };
  return d;
}

/** Shelf-pack every prop into one atlas. */
export function paintPropAtlas(): { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> } {
  const defs = Object.entries(propDefs()).sort((a, b) => b[1].h - a[1].h);
  const W = 1024; let x = 0, y = 0, rowH = 0;
  const pos: [string, PropDef, number, number][] = [];
  for (const [k, d] of defs) {
    const w = d.w + 2, h = d.h + 2;
    if (x + w > W) { x = 0; y += rowH; rowH = 0; }
    pos.push([k, d, x, y]); x += w; rowH = Math.max(rowH, h);
  }
  const pix = new Pix(W, y + rowH);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const [k, d, px, py] of pos) {
    const t = new Pix(d.w + 2, d.h + 2), inner = new Pix(d.w, d.h + 1);
    d.paint(inner); t.blit(inner, 1, 1);
    pix.blit(t, px, py); frames[k] = { x: px, y: py, w: d.w + 2, h: d.h + 2 };
  }
  return { pix, frames };
}
