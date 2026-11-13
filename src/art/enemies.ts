import { Pix, ramp, hash2, mix } from './Pix';

const OUT = 0x1a1424;
export const ENEMY_FRAMES = { move: 4, attack: 3, hurt: 1 } as const;
export type EnemyKind = 'crab' | 'boar' | 'bat' | 'magma' | 'wasp' | 'hunter';
export const ENEMY_SIZE: Record<EnemyKind, [number, number]> = { crab: [32, 24], boar: [44, 30], bat: [32, 26], magma: [24, 22], wasp: [30, 26], hunter: [18, 32] };

type Draw = (p: Pix, anim: keyof typeof ENEMY_FRAMES, i: number) => void;

const crab: Draw = (p, anim, i) => {
  const s = ramp(0xc8463a), l = ramp(0x9a3a3a), up = anim === 'attack' ? [2, 6, 3][i] : 0, w = anim === 'move' ? i : 0;
  for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
    const lift = (k + w + (sd > 0 ? 1 : 0)) % 2 ? 1.5 : 0;
    p.limb(16 + sd * (5 + k * 2), 16, 16 + sd * (9 + k * 2.5), 22 - lift, 1.1, 0.7, l);
  }
  p.ball(16, 14, 9, 6, s);
  for (let k = 0; k < 5; k++) p.px(10 + k * 3, 10 + (k % 2), s[4]);
  for (const sd of [-1, 1]) {
    p.limb(16 + sd * 8, 13, 16 + sd * 12, 9 - up, 1.5, 1.3, l);
    p.ball(16 + sd * 12.5, 7 - up, 3, 2.6, s); p.px(16 + sd * 14, 7 - up, OUT); p.px(16 + sd * 13, 7 - up, OUT);
    p.line(16 + sd * 3, 9, 16 + sd * 3, 6, s[1]); p.px(16 + sd * 3, 5, 0xffffff); p.px(16 + sd * 3, 6, OUT);
  }
  if (anim === 'hurt') p.map((c) => mix(c, 0xffffff, 0.55));
  p.outline(OUT);
};

const boar: Draw = (p, anim, i) => {
  const b = ramp(0x6a5248), th = ramp(0x4f8a3c), ph = (i / 4) * 6.28, charge = anim === 'attack';
  const hy = charge ? 3 : 0;
  for (const [x, o] of [[12, 0], [16, 3.1], [28, 1.5], [32, 4.6]] as const) {
    const sw = anim === 'move' || charge ? Math.sin(ph * (charge ? 2 : 1) + o) * 3 : 0;
    p.limb(x, 20, x + sw, 28, 1.8, 1.3, o > 2 ? ramp(b[1]) : b);
  }
  p.ball(21, 16, 13, 8, b);
  for (let k = 0; k < 7; k++) { const x = 10 + k * 3.4, y = 9 + Math.abs(k - 3) * 0.7; p.poly([[x - 2, y + 2], [x, y - 5 - (k % 2) * 2], [x + 2, y + 2]], th[k % 2 ? 2 : 3]); }
  p.ball(34, 17 + hy, 7, 6, b); p.limb(38, 19 + hy, 42, 20 + hy, 2.6, 2, ramp(b[3]));
  p.limb(38, 21 + hy, 41, 16 + hy, 1, 0.4, ramp(0xf0e8d0)); p.px(36, 15 + hy, charge ? 0xff5040 : 0xffe680); p.px(36, 16 + hy, OUT);
  p.poly([[30, 11 + hy], [32, 7 + hy], [34, 12 + hy]], b[1]);
  p.limb(8, 14, 4, 10, 1, 0.5, b);
  if (anim === 'hurt') p.map((c) => mix(c, 0xffffff, 0.55));
  p.outline(OUT);
};

const bat: Draw = (p, anim, i) => {
  const b = ramp(0x4a3a5c), m = ramp(0x7a4a6a);
  const flap = anim === 'attack' ? [-0.9, 0.2, 0.9][i] : Math.sin((i / 4) * 6.28) * 0.9;
  for (const sd of [-1, 1]) {
    const tx = 16 + sd * 13, ty = 12 - flap * 9, mx = 16 + sd * 7, my = 11 - flap * 5;
    p.poly([[16 + sd * 2, 11], [mx, my - 2], [tx, ty], [16 + sd * 9, my + 6], [16 + sd * 5, 15], [16 + sd * 2, 16]], m[sd < 0 ? 2 : 1]);
    p.line(16 + sd * 2, 11, tx, ty, b[3]); p.line(mx, my - 1, 16 + sd * 9, my + 6, b[1]);
  }
  p.ball(16, 13, 4, 5, b); p.ball(16, 9, 3.5, 3, b);
  p.poly([[13, 8], [12, 3], [15, 7]], b[2]); p.poly([[19, 8], [20, 3], [17, 7]], b[1]);
  p.px(14, 9, 0xffb347); p.px(18, 9, 0xffb347); p.px(15, 11, 0xffffff); p.px(17, 11, 0xffffff);
  if (anim === 'hurt') p.map((c) => mix(c, 0xffffff, 0.55));
  p.outline(OUT);
};

const magma: Draw = (p, anim, i) => {
  const r = ramp(0x4b3040), sq = anim === 'attack' ? [0.7, 1.35, 1][i] : [1, 0.9, 1, 1.12][i];
  const h = 8 * sq, w = 10 / Math.sqrt(sq);
  p.ball(12, 21 - h, w, h, r);
  for (let k = 0; k < 14; k++) { const a = hash2(k, 1, 3) * 6.28, d = 0.3 + hash2(k, 2, 3) * 0.6, x = 12 + Math.cos(a) * w * d, y = 21 - h + Math.sin(a) * h * d; p.px(x, y, 0xf2742e); p.px(x + 1, y, 0xffd27a); if (k % 3 === 0) p.px(x, y + 1, 0xf2742e); }
  p.rect(8, Math.round(20 - h), 2, 2, 0xffe680); p.rect(14, Math.round(20 - h), 2, 2, 0xffe680);
  if (anim === 'hurt') p.map((c) => mix(c, 0xffffff, 0.55));
  p.outline(OUT);
};

const wasp: Draw = (p, anim, i) => {
  const y0 = 13 + (anim === 'move' ? [0, 1, 0, -1][i] : 0), b = ramp(0x3a3a5a), st = ramp(0xf0d040), curl = anim === 'attack' ? [0, 5, 2][i] : 0;
  const wing = (dx: number): void => { const up = i % 2 === 0; p.poly([[13 + dx, y0 - 3], [8 + dx, y0 - (up ? 12 : 8)], [18 + dx, y0 - (up ? 11 : 6)]], 0xcfe8ff, 150); p.line(13 + dx, y0 - 3, 8 + dx, y0 - (up ? 12 : 8), 0xffffff, 200); };
  wing(0); wing(3);
  p.ball(9 - curl * 0.3, y0 + 2 + curl, 5.5, 4, st);
  for (let k = 0; k < 3; k++) p.line(6 + k * 3 - curl * 0.3, y0 - 1 + curl, 6 + k * 3 - curl * 0.3, y0 + 5 + curl, b[1]);
  p.limb(4 - curl * 0.3, y0 + 3 + curl, 1 + curl * 0.6, y0 + 5 + curl * 1.6, 1, 0.3, ramp(0x9ff0ff));
  p.ball(16, y0, 4, 3.5, b); p.ball(22, y0 - 1, 3.5, 3.2, st);
  p.rect(23, y0 - 2, 2, 2, 0xff5040); p.line(24, y0 - 4, 27, y0 - 7, b[1]); p.line(22, y0 - 4, 24, y0 - 8, b[1]);
  for (let k = 0; k < 3; k++) p.line(14 + k * 2, y0 + 3, 13 + k * 2.5, y0 + 7, b[0]);
  if (anim === 'hurt') p.map((c) => mix(c, 0xffffff, 0.55));
  p.outline(OUT);
};

const DRAW: Record<Exclude<EnemyKind, 'hunter'>, Draw> = { crab, boar, bat, magma, wasp };

export function paintEnemyAtlas(): { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> } {
  const pix = new Pix(8 * 46, 5 * 32);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  (Object.keys(DRAW) as Exclude<EnemyKind, 'hunter'>[]).forEach((k, row) => {
    const [w, h] = ENEMY_SIZE[k]; let col = 0;
    for (const [anim, n] of Object.entries(ENEMY_FRAMES)) for (let i = 0; i < n; i++, col++) {
      const t = new Pix(w + 2, h + 2), inner = new Pix(w, h);
      DRAW[k](inner, anim as keyof typeof ENEMY_FRAMES, i); t.blit(inner, 1, 1);
      pix.blit(t, col * 46, row * 32);
      frames[`${k}_${anim}_${i}`] = { x: col * 46, y: row * 32, w: w + 2, h: h + 2 };
    }
  });
  return { pix, frames };
}

/** Top-down ocean sprites. */
export function paintOceanAtlas(): { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> } {
  const pix = new Pix(256, 160);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const put = (name: string, x: number, y: number, w: number, h: number, fn: (p: Pix) => void): void => { const t = new Pix(w, h); fn(t); pix.blit(t, x, y); frames[name] = { x, y, w, h }; };
  const wood = ramp(0x9a6238), sail = ramp(0xf0e6d0);
  // boat (pointing right), 2 sail frames
  for (let f = 0; f < 2; f++) put(`boat_${f}`, f * 44, 0, 42, 26, (p) => {
    p.poly([[2, 8], [28, 5], [40, 13], [28, 21], [2, 18]], wood[2]); p.poly([[4, 10], [27, 8], [35, 13], [27, 18], [4, 16]], wood[1]);
    p.line(2, 8, 28, 5, wood[4]); p.line(28, 5, 40, 13, wood[3]); p.line(2, 18, 28, 21, wood[0]);
    for (let x = 8; x < 28; x += 6) p.line(x, 9, x, 17, wood[0]);
    p.poly([[14, 2 - f], [24 + f, 13], [14, 24 + f]], sail[2]); p.poly([[14, 2 - f], [19, 7], [14, 9]], sail[4]); p.line(14, 24 + f, 24 + f, 13, sail[1]);
    p.line(16, 11, 21, 12, 0xe4533c); p.line(16, 14, 21, 14, 0xe4533c); p.rect(13, 12, 2, 2, wood[0]);
    p.ball(7, 13, 2.2, 2.2, ramp(0x3f55a0)); p.px(7, 12, 0xd9955f); p.px(6, 13, 0xe4533c);
    p.outline(OUT);
  });
  // sea serpent pieces (pointing right)
  const sr = ramp(0x2f8a7a), sb = ramp(0xd8e0a0);
  put('serpent_head', 0, 32, 28, 22, (p) => { p.ball(11, 11, 9, 7, sr); p.limb(16, 11, 25, 11, 5, 3, sr); p.poly([[6, 5], [1, 1], [9, 7]], sb[2]); p.poly([[6, 17], [1, 21], [9, 15]], sb[2]); p.rect(17, 7, 2, 2, 0xffe680); p.rect(17, 14, 2, 2, 0xffe680); p.px(18, 7, OUT); p.px(18, 14, OUT); p.line(8, 11, 14, 11, sr[4]); p.outline(OUT); });
  put('serpent_body', 30, 32, 18, 18, (p) => { p.ball(9, 9, 8, 7, sr); p.poly([[5, 9], [9, 5], [13, 9], [9, 13]], sr[3]); p.px(9, 9, sb[3]); p.outline(OUT); });
  put('serpent_tail', 50, 32, 22, 16, (p) => { p.limb(18, 8, 8, 8, 5, 2, sr); p.poly([[8, 8], [1, 2], [4, 8], [1, 14]], sb[2]); p.outline(OUT); });
  // reef rock, crate, fin, jelly, fish shadow, wind streak, foam ring
  put('reef', 74, 32, 30, 24, (p) => { const r = ramp(0x5a6070); p.ball(13, 13, 11, 8, r); p.ball(21, 15, 7, 6, r); p.ball(9, 9, 5, 4, ramp(0x70788a)); p.outline(OUT); for (let x = 0; x < 30; x++) for (let y = 0; y < 24; y++) if (!p.solid(x, y) && (p.solid(x - 2, y) || p.solid(x + 2, y) || p.solid(x, y + 2) || p.solid(x, y - 2)) && hash2(x, y, 1) > 0.35) p.px(x, y, 0xffffff, 200); });
  put('crate', 106, 32, 16, 16, (p) => { const r = ramp(0x9a6a3e); p.rect(2, 2, 12, 12, r[2]); p.rect(2, 2, 12, 2, r[4]); p.rect(2, 12, 12, 2, r[1]); p.line(3, 3, 12, 12, r[1]); p.outline(OUT); p.rect(1, 15, 14, 1, 0xffffff, 160); });
  for (let f = 0; f < 2; f++) put(`fin_${f}`, 124 + f * 18, 32, 16, 14, (p) => { const r = ramp(0x4a5a7a); p.poly([[3, 12], [9 + f, 1], [13, 12]], r[2]); p.poly([[3, 12], [9 + f, 1], [8, 12]], r[3]); p.outline(OUT); p.rect(0, 12, 16, 1, 0xffffff, 200); p.rect(2, 13, 12, 1, 0xffffff, 120); });
  for (let f = 0; f < 2; f++) put(`fish_${f}`, 160 + f * 26, 32, 24, 14, (p) => { for (let k = 0; k < 6; k++) { const x = 3 + (k % 3) * 7 + f, y = 3 + Math.floor(k / 3) * 6 + (k % 2); p.limb(x, y, x + 4, y, 1.4, 0.6, 0x16405c); p.px(x + 5, y - 1, 0x16405c); p.px(x + 5, y + 1, 0x16405c); } p.map((c) => c); for (let i = 3; i < p.data.length; i += 4) p.data[i] = p.data[i] ? 110 : 0; });
  put('streak', 0, 56, 32, 3, (p) => { for (let x = 0; x < 32; x++) p.px(x, 1, 0xffffff, 255 * Math.sin((x / 31) * 3.14)); for (let x = 8; x < 24; x++) p.px(x, 0, 0xffffff, 90); });
  put('wake', 34, 56, 12, 12, (p) => { p.ellipse(6, 6, 5, 5, 0xffffff, 150); p.ellipse(6, 6, 3, 3, 0xffffff, 0); for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) p.erase(x, y); });
  // water tiles: 4 animated 32x32 frames
  for (let f = 0; f < 4; f++) put(`water_${f}`, f * 34, 72, 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const wv = Math.sin((x + f * 8) / 32 * 6.28 * 2 + Math.sin(y / 32 * 6.28) * 1.5) + Math.sin((y - f * 8) / 32 * 6.28 * 3 + x / 32 * 6.28);
      if (wv > 1.55) p.px(x, y, 0xffffff, 120); else if (wv > 1.2) p.px(x, y, 0xffffff, 50); else if (wv < -1.5) p.px(x, y, 0x000020, 40);
    }
  });
  put('marker', 140, 72, 9, 12, (p) => { p.poly([[4, 11], [0, 4], [4, 0], [8, 4]], 0xe4533c); p.px(4, 4, 0xffffff); p.outline(OUT); });
  put('cloudshadow', 152, 72, 64, 40, (p) => { for (let k = 0; k < 6; k++) p.ellipse(14 + k * 7, 20 + Math.sin(k) * 5, 12, 9, 0x000020, 255); for (let i = 3; i < p.data.length; i += 4) p.data[i] = p.data[i] ? 46 : 0; });
  put('stormcloud', 0, 112, 72, 44, (p) => { const c = ramp(0x4a5670); for (let k = 0; k < 7; k++) p.ball(12 + k * 8, 22 + Math.sin(k * 1.7) * 6, 13, 10, c); p.outline(0x20283a); for (let i = 3; i < p.data.length; i += 4) p.data[i] = p.data[i] ? 215 : 0; });
  return { pix, frames };
}
