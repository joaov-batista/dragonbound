import { Pix, ramp, deg } from './Pix';
import { HERO_ANIMS, HERO_FRAME, type HeroAnim } from './heroAnims';

/** Pose of the hero rig. Angles in degrees: 0 = down, 90 = forward, 180 = up. */
interface Pose {
  hx: number; hy: number; lean: number; headY: number;
  aF: [number, number]; aB: [number, number];
  fF: [number, number]; fB: [number, number]; // foot targets: x offset from hip, lift above ground
  sword: number | null; scarf: number; wave: number; eye: 'open' | 'closed' | 'hurt';
  air?: boolean; // feet not constrained to the ground line
}

const SKIN = ramp(0xd9955f), HAIR = ramp(0x33283f), TUNIC = ramp(0x3f55a0), PANTS = ramp(0xc8b086);
const LEATHER = ramp(0x7c4a2e), SCARF = ramp(0xe4533c), BLADE = ramp(0xd8e6dc), BAND = 0xf2c14e;
const OUT = 0x1a1424;

const GROUND = 44, HIP_Y = 34, CX = 22;
const dir = (a: number, l: number): [number, number] => [Math.sin(deg(a)) * l, Math.cos(deg(a)) * l];

function leg(p: Pix, hx: number, hy: number, fx: number, fy: number, back: boolean): void {
  const L1 = 5.2, L2 = 5.2;
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  if (d > L1 + L2 - 0.01) { const k = (L1 + L2 - 0.01) / d; dx *= k; dy *= k; d = L1 + L2 - 0.01; fx = hx + dx; fy = hy + dy; }
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const base = Math.atan2(dx, dy);
  const kx = hx + Math.sin(base + a) * L1, ky = hy + Math.cos(base + a) * L1;
  const pr = back ? ramp(PANTS[1]) : PANTS, lr = back ? ramp(LEATHER[1]) : LEATHER;
  p.limb(hx, hy, kx, ky, 2.1, 1.7, pr);
  p.limb(kx, ky, fx, fy - 1, 1.7, 1.5, lr);
  p.rect(Math.round(fx) - 1, Math.round(fy) - 1, 4, 2, lr[1]);
  p.px(Math.round(fx) + 2, Math.round(fy) - 1, lr[2]);
}

function arm(p: Pix, sx: number, sy: number, a: [number, number], back: boolean): [number, number] {
  const [ex, ey] = dir(a[0], 4.2), [hx, hy] = dir(a[1], 4);
  const tr = back ? ramp(TUNIC[1]) : TUNIC, sk = back ? ramp(SKIN[1]) : SKIN;
  p.limb(sx, sy, sx + ex, sy + ey, 1.7, 1.4, tr);
  p.limb(sx + ex, sy + ey, sx + ex + hx, sy + ey + hy, 1.3, 1.2, sk);
  return [sx + ex + hx, sy + ey + hy];
}

function sword(p: Pix, x: number, y: number, a: number): void {
  const [dx, dy] = dir(a, 1);
  // grip + guard
  p.limb(x - dx * 1.5, y - dy * 1.5, x + dx * 1.5, y + dy * 1.5, 0.8, 0.8, LEATHER[1]);
  p.line(x + dx * 2 - dy * 2, y + dy * 2 + dx * 2, x + dx * 2 + dy * 2, y + dy * 2 - dx * 2, BAND);
  // blade: curved fang-like
  const len = 13;
  for (let i = 3; i <= len; i++) {
    const t = (i - 3) / (len - 3), w = 1.25 * (1 - t * t * 0.85);
    const bend = Math.sin(t * 1.4) * 1.6;
    const bx = x + dx * i - dy * bend, by = y + dy * i + dx * bend;
    p.limb(bx, by, bx, by, w, w, BLADE[2]);
    p.px(bx + dy * 0.6, by - dx * 0.6, BLADE[4]);
    if (t > 0.1) p.px(bx - dy * 0.9, by + dx * 0.9, BLADE[1]);
  }
}

export function drawHero(p: Pix, ox: number, oy: number, q: Pose): void {
  const hipX = ox + CX + q.hx, hipY = oy + HIP_Y + q.hy;
  const [tx, ty] = dir(180 - q.lean, 8.5);
  const nx = hipX + tx, ny = hipY + ty; // neck
  const [hdx, hdy] = dir(180 - q.lean * 0.6, 4.5);
  const headX = nx + hdx, headY = ny + hdy + q.headY;
  const shX = nx - tx * 0.12, shY = ny - ty * 0.12 + 1;
  const g = oy + GROUND;
  const footY = (lift: number): number => (q.air ? hipY + 10 - lift : g - lift);

  const layer = new Pix(p.w, p.h);
  // scarf (behind everything)
  let sx = nx - 1.5, sy = ny + 0.5;
  for (let i = 0; i < 4; i++) {
    const a = deg(q.scarf + Math.sin(q.wave + i * 1.3) * 22 * (0.4 + i * 0.3));
    const ex = sx - Math.cos(a) * 3.6, ey = sy + Math.sin(a) * 3.6;
    layer.limb(sx, sy, ex, ey, 1.9 - i * 0.25, 1.6 - i * 0.3, SCARF);
    sx = ex; sy = ey;
  }
  // back arm + back leg
  const backHand = arm(layer, shX - 1, shY, q.aB, true);
  leg(layer, hipX - 1, hipY, hipX + q.fB[0], footY(q.fB[1]), true);
  if (q.sword !== null && q.sword < -900) sword(layer, backHand[0], backHand[1], q.sword + 2000);
  // torso
  layer.limb(hipX, hipY - 0.5, nx, ny + 1.5, 3.1, 3.3, TUNIC);
  layer.limb(hipX - 0.5, hipY, hipX + 0.5, hipY, 3, 3, PANTS);
  const [bx, by] = dir(180 - q.lean, 2.2);
  layer.line(hipX + bx - 3, hipY + by, hipX + bx + 3, hipY + by, LEATHER[2]);
  layer.px(hipX + bx + 1, hipY + by, BAND);
  // front leg
  leg(layer, hipX + 1, hipY, hipX + q.fF[0], footY(q.fF[1]), false);
  // scarf knot
  layer.limb(nx - 2, ny + 1, nx + 2.5, ny + 1.5, 1.7, 1.5, SCARF);
  // head
  layer.ball(headX, headY, 4.6, 4.4, SKIN);
  // hair: cap + back tuft
  for (let y = -6; y <= 2; y++)
    for (let x = -6; x <= 5; x++) {
      const nxh = x / 5.2, nyh = (y + 1) / 4.6;
      if (nxh * nxh + nyh * nyh <= 1 && (y < -1 - Math.max(0, x) * 0.45 || x < -2)) layer.px(headX + x, headY + y, x + y < -5 ? HAIR[3] : y > -1 ? HAIR[1] : HAIR[2]);
    }
  layer.limb(headX - 4, headY - 2, headX - 7.5, headY - 3 + Math.sin(q.wave) * 1.2, 1.6, 0.7, HAIR);
  layer.limb(headX - 4, headY, headX - 6.5, headY + 1.5 + Math.cos(q.wave) * 1, 1.3, 0.6, ramp(HAIR[1]));
  layer.line(headX - 4, headY - 2, headX + 4, headY - 2.4, BAND);
  // face
  if (q.eye === 'open') { layer.px(headX + 2, headY, OUT); layer.px(headX + 2, headY + 1, OUT); layer.px(headX + 3, headY, 0xffffff); }
  else if (q.eye === 'closed') { layer.px(headX + 2, headY + 1, OUT); layer.px(headX + 3, headY + 1, OUT); }
  else { layer.px(headX + 1, headY, OUT); layer.px(headX + 3, headY, OUT); layer.px(headX + 2, headY + 1, OUT); }
  layer.px(headX + 3, headY + 2, SKIN[1]);
  // front arm + weapon
  const hand = arm(layer, shX + 1, shY, q.aF, false);
  if (q.sword !== null && q.sword > -900) sword(layer, hand[0], hand[1], q.sword);
  layer.outline(OUT);
  p.blit(layer, 0, 0);
}

const P = (o: Partial<Pose>): Pose => ({
  hx: 0, hy: 0, lean: 4, headY: 0, aF: [12, 28], aB: [-12, 8], fF: [3, 0], fB: [-3, 0],
  sword: null, scarf: 72, wave: 0, eye: 'open', ...o,
});
const TAU = Math.PI * 2;

export function heroPose(anim: HeroAnim, i: number): Pose {
  const n = HERO_ANIMS[anim].n, t = i / n, ph = t * TAU;
  switch (anim) {
    case 'idle': {
      const b = [0, 0, 1, 1, 1, 0][i];
      return P({ hy: b, wave: ph, aF: [10, 26 - b * 4], aB: [-10, 6 + b * 3], eye: i === 4 ? 'closed' : 'open', scarf: 74 + b * 3 });
    }
    case 'run': {
      const f = (p: number): [number, number] => [Math.cos(p) * 6.5, Math.max(0, -Math.sin(p)) * 4.5];
      const c = Math.cos(ph);
      return P({ hy: [0, -1, 0, 1][i % 4], lean: 14, fF: f(ph), fB: f(ph + Math.PI), aF: [-42 * c, -42 * c + 62], aB: [42 * c, 42 * c + 55], scarf: 8, wave: ph * 2 });
    }
    case 'jump': return P({ air: true, hy: -1, lean: 6, fF: [4, 5 - i], fB: [-3, 1], aF: [150 - i * 20, 190], aB: [-60, -20], scarf: 62 - i * 10, wave: i });
    case 'fall': return P({ air: true, lean: -2, fF: [4, 2 + i], fB: [-4, 4 - i], aF: [140, 175 + i * 10], aB: [-130, -160 - i * 8], scarf: -58, wave: i * 2 });
    case 'dash': return P({ air: true, hy: 3, hx: 2, lean: 58, headY: 1, fF: [-3, 6], fB: [-9, 8], aF: [-60, -75], aB: [-80, -85], sword: -70 - 2000 + 2000, scarf: -4, wave: i * 2 });
    case 'wall': return P({ air: true, hx: 3, lean: -8, fF: [5, 4], fB: [4, 0], aF: [150, 120], aB: [120, 100], scarf: -50, wave: 1 });
    case 'attack1': {
      const sw = [215, 105, 35, 55][i], sh = [165, 95, 40, 35][i];
      return P({ hx: [0, 2, 3, 2][i], lean: [-6, 16, 22, 12][i], fF: [[4, 0], [7, 0], [8, 0], [6, 0]][i] as [number, number], fB: [-4, 0], aF: [sh, sh + [40, 0, -8, 12][i]], aB: [-30, -5], sword: sw, scarf: [60, 20, 10, 40][i], wave: i });
    }
    case 'attack2': {
      const sw = [15, 100, 185, 150][i], sh = [25, 95, 165, 125][i];
      return P({ hx: [1, 3, 3, 2][i], lean: [18, 10, -4, 2][i], fF: [[6, 0], [7, 0], [7, 0], [5, 0]][i] as [number, number], fB: [-4, 0], aF: [sh, sh + [-10, 5, 20, 10][i]], aB: [-20, 10], sword: sw, scarf: [30, 50, 80, 70][i], wave: i });
    }
    case 'attack3': {
      const sw = [230, 215, 95, 12, 30][i], sh = [185, 190, 100, 28, 30][i];
      return P({ air: i < 3, hx: [0, 1, 3, 4, 3][i], hy: [-1, -4, -2, 2, 1][i], lean: [-10, -12, 18, 34, 18][i], fF: [[3, 2], [4, 5], [6, 2], [8, 0], [6, 0]][i] as [number, number], fB: [[-3, 0], [-3, 3], [-5, 1], [-5, 0], [-4, 0]][i] as [number, number], aF: [sh, sh + [30, 25, 0, -5, 10][i]], aB: [[-30, 0], [150, 185], [80, 95], [20, 25], [0, 20]][i] as [number, number], sword: sw, scarf: [50, 80, 20, -20, 30][i], wave: i });
    }
    case 'airattack': {
      const sw = [160, 70, -20, 250][i], sh = [150, 80, 10, 200][i];
      return P({ air: true, lean: [0, 20, 30, 10][i], fF: [3, 5], fB: [-4, 5], aF: [sh, sh + 10], aB: [-40, -10], sword: sw, scarf: [40, 0, -30, 20][i], wave: i });
    }
    case 'parry': return P({ hy: 1, lean: i === 0 ? 2 : -4, fF: [5, 0], fB: [-5, 0], aF: [75, 150], aB: [60, 120], sword: 178, scarf: 60 + i * 5, wave: i });
    case 'hurt': return P({ air: true, hx: -2, lean: -22, fF: [5, 3], fB: [-2, 1], aF: [120, 150], aB: [-100, -140], eye: 'hurt', scarf: 150, wave: 2 });
    case 'death': {
      const l = [-20, -45, -70, -88, -90][i];
      return P({ hx: -i, hy: [0, 2, 5, 7, 8][i], lean: l, fF: [5 + i, 0], fB: [2 + i, 0], aF: [100, 110], aB: [-90 + l, -100 + l], eye: i > 1 ? 'closed' : 'hurt', scarf: 110, wave: i });
    }
    case 'sneak': {
      const f = (p: number): [number, number] => [Math.cos(p) * 3.5, Math.max(0, -Math.sin(p)) * 1.8];
      return P({ hy: 3, lean: 24, headY: 0, fF: f(ph), fB: f(ph + Math.PI), aF: [35, 70], aB: [25, 60], scarf: 80, wave: ph });
    }
    case 'offer': return P({ hy: 1, lean: 10, aF: [84, 88 + i * 4], aB: [-5, 10], fF: [5, 0], fB: [-4, 0], scarf: 78, wave: i * 2 });
    case 'pet': { const s = [96, 108, 96, 84][i]; return P({ hy: 1, lean: 8, aF: [s, s + 8], aB: [-5, 10], fF: [5, 0], fB: [-4, 0], scarf: 76, wave: ph }); }
    case 'calm': return P({ hy: 3, lean: 14, headY: 1, aF: [42, 66 + i * 5], aB: [36, 58 + i * 5], fF: [4, 0], fB: [-4, 0], eye: 'closed', scarf: 82, wave: i * 2 });
    case 'whistle': return P({ lean: -2, aF: [115, 200 + i * 6], aB: [-10, 5], scarf: 70, wave: i * 2 });
    case 'ride': return P({ air: true, hy: 0, lean: 10 + i * 22, fF: [5, 4], fB: [3, 4], aF: [60 + i * 10, 85], aB: [55, 80], scarf: 30 - i * 25, wave: i * 2 });
    case 'swim': return P({ air: true, hy: 2, lean: 62, fF: [-6, 8 + Math.sin(ph) * 1.5], fB: [-8, 8 - Math.sin(ph) * 1.5], aF: [70 + Math.sin(ph) * 60, 80 + Math.sin(ph) * 50], aB: [70 - Math.sin(ph) * 60, 80 - Math.sin(ph) * 50], scarf: 10, wave: ph });
  }
}

export function heroFrameNames(): string[] {
  const out: string[] = [];
  for (const [k, d] of Object.entries(HERO_ANIMS)) for (let i = 0; i < d.n; i++) out.push(`${k}_${i}`);
  return out;
}

/** Paints the full hero sheet; returns pixel canvas + frame rects. */
export function paintHeroSheet(): { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> } {
  const names = heroFrameNames(), cols = 12, rows = Math.ceil(names.length / cols);
  const pix = new Pix(cols * HERO_FRAME, rows * HERO_FRAME);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  let k = 0;
  for (const [anim, d] of Object.entries(HERO_ANIMS))
    for (let i = 0; i < d.n; i++, k++) {
      const x = (k % cols) * HERO_FRAME, y = Math.floor(k / cols) * HERO_FRAME;
      drawHero(pix, x, y, heroPose(anim as HeroAnim, i));
      frames[`${anim}_${i}`] = { x, y, w: HERO_FRAME, h: HERO_FRAME };
    }
  return { pix, frames };
}
