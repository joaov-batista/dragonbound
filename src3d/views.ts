import { Pix, ramp, type Ramp } from '../src/art/Pix';
import { HERO_STYLE, type HeroStyle } from '../src/art/hero';
import type { Phenotype } from '../src/dragons/genetics/types';

/**
 * Front and back views for the 3D billboards (the 2D game only had side views).
 * Hero: 48x48 cells, feet at y=44. Dragon: 128x104 cells, feet at y=98.
 */
export type Frames = Record<string, { x: number; y: number; w: number; h: number }>;
const OUT = 0x1a1424;
export const HERO_CELL = 48, HERO_FEET = 44, DRG_W = 128, DRG_H = 104, DRG_FEET = 98;

// ── hero ───────────────────────────────────────────────────────────────────
/** Equipment that shows on the hero. */
export interface Gear { sword: 'none' | 'wood' | 'iron' | 'fire'; shield: 'none' | 'wood' | 'iron' | 'scale'; armor: 'cloth' | 'leather' | 'iron' | 'scale' }
export const NO_GEAR: Gear = { sword: 'wood', shield: 'none', armor: 'cloth' };
const BLADE: Record<Gear['sword'], number> = { none: 0, wood: 0xb08050, iron: 0xd8e6dc, fire: 0xffa040 };
const SHIELD: Record<Gear['shield'], number> = { none: 0, wood: 0x8a5a34, iron: 0x9aa4b0, scale: 0x3f9a8a };
const ARMOR: Record<Gear['armor'], number | null> = { cloth: null, leather: 0x7c4a2e, iron: 0x8a94a4, scale: 0x3f8a7a };

type HeroPose = { bob: number; legL: number; legR: number; armL: number; armR: number; crouch: number; reach: number; sit: boolean; swing: number; block: boolean; roll: boolean };
const HP = (o: Partial<HeroPose>): HeroPose => ({ bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, crouch: 0, reach: 0, sit: false, swing: -1, block: false, roll: false, ...o });

function heroView(p: Pix, ox: number, back: boolean, q: HeroPose, st: HeroStyle = HERO_STYLE, gear: Gear = NO_GEAR): void {
  const armorC = ARMOR[gear.armor];
  const SK = ramp(st.skin), HA = ramp(st.hair), TU = ramp(armorC ?? st.tunic), PA = ramp(st.pants), LE = ramp(st.leather), SC = ramp(st.scarf ?? st.tunic);
  const C = ox + 24, g = HERO_FEET, dy = q.bob + q.crouch, hip = g - 10 + dy;
  if (q.roll) { // tucked into a roll
    p.ball(C, g - 7, 7, 6.5, TU); p.ball(C, g - 12, 4.5, 4, HA); p.rect(C - 5, g - 5, 10, 2, LE[2]);
    if (gear.shield !== 'none') p.ball(C + (back ? 0 : -5), g - 7, 4, 5, ramp(SHIELD[gear.shield]));
    return;
  }
  if (!q.sit) {
    for (const [sx, lift] of [[-1, q.legL], [1, q.legR]] as const) {
      const x = C + sx * 2.5 - (sx < 0 ? 1 : 0), top = hip, bot = g - lift;
      p.rect(x - 1, top, 3, Math.max(2, bot - top - 2), PA[back ? 1 : 2]);
      p.rect(x - 1, bot - 3, 3, 3, LE[1]); if (!back) p.px(x, bot - 3, LE[3]);
    }
  } else { p.rect(C - 6, hip - 1, 4, 3, PA[2]); p.rect(C + 2, hip - 1, 4, 3, PA[2]); p.rect(C - 7, hip + 1, 2, 3, LE[1]); p.rect(C + 5, hip + 1, 2, 3, LE[1]); }
  // shield on the back when seen from behind (drawn under the cloak)
  if (back && gear.shield !== 'none' && !q.block) { const sr = ramp(SHIELD[gear.shield]); p.ball(C, hip - 6, 5, 6, sr); p.ball(C, hip - 6, 1.4, 1.4, ramp(0xf2c14e)); }
  // torso (armour plates when worn)
  p.ball(C, hip - 5, 5, 6, back ? ramp(TU[1]) : TU);
  if (armorC !== null) { p.rect(C - 4, hip - 9, 8, 1, TU[3]); p.rect(C - 4, hip - 6, 8, 1, TU[1]); if (gear.armor === 'iron' || gear.armor === 'scale') for (const sx of [-1, 1]) p.ball(C + sx * 5, hip - 10, 2.2, 1.6, ramp(TU[3])); }
  p.rect(C - 5, hip - 1, 10, 2, LE[2]); p.px(C, hip - 1, 0xf2c14e);
  // arms: swing (sword arm), block (shield up), reach (offering)
  for (const [sx, sw] of [[-1, q.armL], [1, q.armR]] as const) {
    const shx = C + sx * 5, shy = hip - 9;
    let hx = shx + sx * 1.2, hy = hip - 2 + sw;
    if (q.reach > 0 && !back) { hx = C + sx * 2; hy = hip - 6 - q.reach; }
    if (q.swing >= 0 && sx > 0) { const a = -1.2 + q.swing * 1.4; hx = shx + Math.cos(a) * 6 * (back ? -1 : 1); hy = shy + Math.sin(a) * 6; }
    if (q.block && sx < 0) { hx = C - 2; hy = hip - 9; }
    p.limb(shx, shy, hx, hy, 1.6, 1.3, back ? ramp(TU[1]) : TU); p.ball(hx, hy + 0.5, 1.3, 1.3, SK);
    if (sx > 0 && gear.sword !== 'none' && (q.swing >= 0 || !back)) { const br = ramp(BLADE[gear.sword]), a = q.swing >= 0 ? -1.6 + q.swing * 1.4 : 1.25; const ex = hx + Math.cos(a) * 9 * (back ? -1 : 1), ey = hy + Math.sin(a) * 9; p.limb(hx, hy, ex, ey, 1, 0.7, br); if (gear.sword === 'fire') { p.px(ex, ey - 1, 0xfff0a0); p.px(ex + 1, ey - 2, 0xff6020); } }
    if (sx < 0 && gear.shield !== 'none' && (q.block || !back)) { const sr = ramp(SHIELD[gear.shield]); p.ball(hx - (q.block ? 0 : 1), hy - 1, q.block ? 5 : 3.5, q.block ? 6 : 4.5, sr); p.ball(hx - (q.block ? 0 : 1), hy - 1, 1.2, 1.2, ramp(0xf2c14e)); }
  }
  // scarf
  if (st.scarf !== null) {
    p.rect(C - 4, hip - 12, 8, 2, SC[2]); p.rect(C - 4, hip - 12, 8, 1, SC[3]);
    if (back) for (let k = 0; k < 6; k++) p.rect(C - 1 + Math.round(Math.sin(k * 0.9 + q.bob) * 1.2), hip - 11 + k, 3, 1, SC[k < 3 ? 2 : 1]);
    else p.rect(C + 1, hip - 11, 2, 3, SC[1]);
  }
  // head, hair, beard, hat
  const hy = hip - 18;
  p.ball(C, hy, 5.5, 5.5, SK);
  const hs = st.hairStyle;
  if (back) {
    if (hs !== 'bald') p.ball(C, hy - 0.5, 5.8, 5.6, HA);
    if (hs === 'long') p.rect(C - 4, hy + 2, 8, 6, HA[1]); if (hs === 'braid') for (let k = 0; k < 4; k++) p.ball(C, hy + 5 + k * 2, 1.4, 1.2, k % 2 ? ramp(HA[1]) : HA); if (hs === 'bun') p.ball(C, hy - 5, 2.4, 2.2, HA);
  } else {
    if (hs !== 'bald') { p.ball(C, hy - 3.5, 5.8, 3, HA); if (hs === 'tuft') { p.px(C + 2, hy - 7, HA[3]); p.px(C + 3, hy - 8, HA[2]); } }
    if (hs === 'long' || hs === 'braid') for (const sx of [-1, 1]) p.rect(C + sx * 5 - (sx < 0 ? 1 : 0), hy - 2, 2, 7, HA[1]);
    if (hs === 'bun') p.ball(C, hy - 7, 2.2, 2, HA);
    p.px(C - 2, hy + 1, 0x1a1424); p.px(C + 2, hy + 1, 0x1a1424); p.px(C - 2, hy, 0xffffff); p.px(C + 2, hy, 0xffffff);
    p.px(C, hy + 3, SK[1]);
    if (st.beard !== 'none') { const L = st.beard === 'long' ? 5 : 2; p.ball(C, hy + 4 + L * 0.4, 4, 1.5 + L * 0.5, HA); }
  }
  if (st.hat === 'hood') { const hr = ramp(st.hatColor ?? st.tunic); p.ball(C, hy - 1.5, 6.4, 6, hr); if (!back) p.ball(C, hy + 0.5, 4.4, 4.2, SK); }
  else if (st.hat === 'helm' || gear.armor === 'iron') { const hr = ramp(st.hatColor ?? 0x8a8a9a); p.ball(C, hy - 3, 6, 3.6, hr); p.rect(C - 6, hy - 1, 12, 1, hr[1]); if (!back) p.line(C, hy - 1, C, hy + 2, hr[2]); }
  else if (st.hat === 'cap') { const hr = ramp(st.hatColor ?? 0x7a5a8a); p.ball(C, hy - 4, 5.6, 2.6, hr); }
  else if (st.band !== null && hs !== 'bald') p.rect(C - 5, hy - 2, 11, 1, st.band ?? 0xf2c14e);
}

/** Front/back hero frames: {front|back}_{idle0-1,walk0-3,sneak0-3,offer0-1,ride0,atk0-2,block0,roll0-1}. */
export function paintHeroViews(st: HeroStyle = HERO_STYLE, gear: Gear = NO_GEAR): { pix: Pix; frames: Frames } {
  const poses: [string, HeroPose][] = [
    ['idle_0', HP({})], ['idle_1', HP({ bob: 1 })],
    ...[0, 1, 2, 3].map((i): [string, HeroPose] => [`walk_${i}`, HP({ bob: i % 2 ? 1 : 0, legL: i === 0 ? 2 : 0, legR: i === 2 ? 2 : 0, armL: i === 0 ? -2 : i === 2 ? 1 : 0, armR: i === 2 ? -2 : i === 0 ? 1 : 0 })]),
    ...[0, 1, 2, 3].map((i): [string, HeroPose] => [`sneak_${i}`, HP({ crouch: 3, legL: i === 0 ? 1 : 0, legR: i === 2 ? 1 : 0 })]),
    ['offer_0', HP({ reach: 2 })], ['offer_1', HP({ reach: 3, bob: 1 })], ['ride_0', HP({ sit: true })],
    ['atk_0', HP({ swing: 0 })], ['atk_1', HP({ swing: 0.6, bob: 1 })], ['atk_2', HP({ swing: 1, crouch: 1 })],
    ['block_0', HP({ block: true, crouch: 1 })], ['roll_0', HP({ roll: true })], ['roll_1', HP({ roll: true, bob: 1 })],
  ];
  const frames: Frames = {}, pix = new Pix(HERO_CELL * poses.length, HERO_CELL * 2);
  poses.forEach(([n, q], i) => {
    for (const [row, back] of [[0, false], [1, true]] as const) {
      const c = new Pix(HERO_CELL, HERO_CELL); heroView(c, 0, back, q, st, gear); c.outline(OUT);
      pix.blit(c, i * HERO_CELL, row * HERO_CELL);
      frames[`${back ? 'back' : 'front'}_${n}`] = { x: i * HERO_CELL, y: row * HERO_CELL, w: HERO_CELL, h: HERO_CELL };
    }
  });
  return { pix, frames };
}

// ── dragon ─────────────────────────────────────────────────────────────────
type DPose = { bob: number; legs: [number, number]; tail: number; wing: 'fold' | 'spread'; flap: number; head: number; rider: boolean };
const DP = (o: Partial<DPose>): DPose => ({ bob: 0, legs: [0, 0], tail: 0, wing: 'fold', flap: 0, head: 0, rider: false, ...o });

function wings(p: Pix, C: number, y: number, rx: number, s: number, ph: Phenotype, q: DPose, SE: Ramp, PR: Ramp): void {
  for (const sd of [-1, 1]) {
    if (q.wing === 'fold') { p.poly([[C + sd * rx * 0.3, y + 2], [C + sd * (rx + 5 * s), y - 9 * s], [C + sd * (rx + 2 * s), y + 6 * s]], SE[sd < 0 ? 2 : 1]); continue; }
    const span = Math.min(60, 30 * s * ph.wingSpan), tipY = y - q.flap * 16 * s, midY = y - q.flap * 8 * s;
    const root: [number, number] = [C + sd * rx * 0.35, y], elbow: [number, number] = [C + sd * span * 0.5, midY - 4 * s], tip: [number, number] = [C + sd * span, tipY];
    p.poly([root, elbow, tip, [C + sd * span * 0.86, tipY + 8 * s], [C + sd * span * 0.62, midY + 9 * s], [C + sd * span * 0.38, y + 9 * s], [C + sd * rx * 0.3, y + 6 * s]], SE[2]);
    p.limb(root[0], root[1], elbow[0], elbow[1], 1.6 * s, 1.2, PR); p.limb(elbow[0], elbow[1], tip[0], tip[1], 1.2, 0.6, PR);
    p.line(elbow[0], elbow[1], C + sd * span * 0.62, midY + 9 * s, PR[1]); p.line(elbow[0], elbow[1], C + sd * span * 0.38, y + 9 * s, PR[1]);
    p.line(root[0], root[1] - 1, elbow[0], elbow[1] - 1, SE[4]);
  }
}

function dragonView(p: Pix, front: boolean, ph: Phenotype, scale: number, q: DPose, rs: HeroStyle = HERO_STYLE): void {
  const s = Math.max(0.45, ph.size * scale), PR = ramp(ph.primary), SE = ramp(ph.secondary), HN = ramp(ph.horn), AC = ramp(ph.accent);
  const C = DRG_W / 2, g = DRG_FEET, legH = (q.wing === 'spread' ? 4 : 9 + ph.legLen * 6) * s, rx = 11 * s * ph.girth + 4, ry = 9 * s + 2;
  const by = g - legH - ry * 0.6 + q.bob;
  if (!front) {
    // seen from behind: wings, haunches, tail toward the viewer, head peeking over the back
    if (q.wing === 'spread') wings(p, C, by - ry * 0.4, rx, s, ph, q, SE, PR);
    const hy = by - ry - 4 * s * ph.neckLen + q.head;
    p.limb(C, by - ry * 0.4, C, hy + 3, 3.4 * s, 2.6 * s, PR);
    p.ball(C, hy, 4.4 * s, 3.8 * s, PR);
    if (ph.horns !== 'none') for (const sd of [-1, 1]) p.limb(C + sd * 2.6 * s, hy - 1, C + sd * 5 * s, hy - 6 * s, 1.1, 0.4, HN);
    p.ball(C, by, rx, ry, PR);
    for (let k = 0; k < 4; k++) p.px(C + (k - 1.5) * rx * 0.4, by - ry * 0.55, PR[4]);
    if (ph.spines !== 'none') for (let k = 0; k < 5; k++) { const y = by - ry * 0.8 + k * ry * 0.38; p.poly([[C - 1.5, y + 2], [C, y - 2], [C + 1.5, y + 2]], HN[2]); }
    for (const sd of [-1, 1]) { const lx = C + sd * rx * 0.62, lift = sd < 0 ? q.legs[0] : q.legs[1]; p.limb(lx, by + ry * 0.2, lx + sd * 1.5, g - 1 - lift, 3.2 * s, 2.4 * s, ramp(PR[1])); p.rect(lx + sd * 1.5 - 2, g - 2 - lift, 5, 2, PR[0]); }
    // tail coming toward the camera
    let tx = C, ty = by + ry * 0.6;
    for (let k = 0; k < 6; k++) { const nx = C + Math.sin(q.tail + k * 0.7) * (2 + k * 1.6) * s, ny = ty + 2.4 * s * ph.tailLen; p.limb(tx, ty, nx, ny, (3 - k * 0.4) * s + 0.6, (2.6 - k * 0.4) * s + 0.5, PR); tx = nx; ty = ny; }
    if (ph.tail !== 'whip') p.ball(tx, ty + 1, 2.2 * s, 1.6 * s, ph.tail === 'club' ? HN : SE);
    if (q.wing === 'fold') wings(p, C, by - ry * 0.4, rx, s, ph, q, SE, PR);
    if (q.rider) {
      const SK = ramp(rs.skin), TU = ramp(rs.tunic), HA = ramp(rs.hair), r0 = by - ry - 1;
      p.rect(C - 5, r0 + 3, 10, 3, 0xc8463a); p.rect(C - 5, r0 + 3, 10, 1, 0xf2c14e);
      p.ball(C, r0 - 2, 4, 5, TU); p.limb(C - 4, r0 - 4, C - 6, r0 + 1, 1.3, 1.1, TU); p.limb(C + 4, r0 - 4, C + 6, r0 + 1, 1.3, 1.1, TU);
      const scf = rs.scarf ?? rs.tunic; p.rect(C - 3, r0 - 7, 6, 2, scf); for (let k = 0; k < 4; k++) p.px(C + 3 + k, r0 - 6 + Math.round(Math.sin(k + q.flap * 3)), ramp(scf)[1]);
      p.ball(C, r0 - 11, 4, 4, HA); p.rect(C - 4, r0 - 12, 8, 1, 0xf2c14e); void SK;
    }
  } else {
    // facing the camera: chest and belly, front legs, a big head with eyes
    if (q.wing === 'spread') wings(p, C, by - ry * 0.4, rx, s, ph, q, SE, PR);
    else wings(p, C, by - ry * 0.5, rx * 0.9, s, ph, q, SE, PR);
    // tail tip swinging behind
    p.limb(C + Math.sin(q.tail) * rx, by + ry * 0.1, C + Math.sin(q.tail) * (rx + 8 * s), by - 6 * s, 2 * s, 1, PR);
    p.ball(C, by, rx * 0.95, ry, PR);
    p.ball(C, by + 1, rx * 0.55, ry * 0.8, SE);
    for (let k = 0; k < 3; k++) p.rect(C - rx * 0.4, by - 2 + k * 3, rx * 0.8, 1, SE[1]);
    for (const sd of [-1, 1]) { const lx = C + sd * rx * 0.5, lift = sd < 0 ? q.legs[0] : q.legs[1]; p.limb(lx, by + ry * 0.3, lx, g - 1 - lift, 3 * s, 2.4 * s, PR); for (let c = -1; c <= 1; c++) p.px(lx + c * 1.5, g - 1 - lift, HN[3]); }
    const hy = by - ry - 5 * s * ph.neckLen + q.head;
    p.limb(C, by - ry * 0.5, C, hy + 4, 3.6 * s, 3 * s, PR);
    p.ball(C, hy, 6 * s, 5 * s, PR);
    p.ball(C, hy + 3.5 * s, 3.8 * s, 2.6 * s, PR); p.px(C - 1.5 * s, hy + 4 * s, PR[0]); p.px(C + 1.5 * s, hy + 4 * s, PR[0]);
    for (const sd of [-1, 1]) { p.ellipse(C + sd * 2.8 * s, hy - 0.5, 1.4 * s, 1.6 * s, ph.eye); p.px(C + sd * 2.8 * s - 0.5, hy - 1.5, 0xffffff); }
    if (ph.horns !== 'none') for (const sd of [-1, 1]) p.limb(C + sd * 3.8 * s, hy - 3 * s, C + sd * 7 * s, hy - 9 * s, 1.3, 0.4, HN);
    if (ph.pattern !== 'none') for (let k = 0; k < 3; k++) p.px(C - 2 + k * 2, hy - 4 * s, AC[3]);
  }
}

/** Front/back dragon frames for one individual: {back|front}_{idle0-1,walk0-3}, back_fly0-5, rider_fly0-5. */
export function paintDragonViews(ph: Phenotype, scale: number, rider: HeroStyle = HERO_STYLE): { pix: Pix; frames: Frames } {
  const list: [string, boolean, DPose][] = [];
  for (const front of [false, true]) {
    const v = front ? 'front' : 'back';
    list.push([`${v}_idle_0`, front, DP({})], [`${v}_idle_1`, front, DP({ bob: 1, tail: 0.6 })]);
    for (let i = 0; i < 4; i++) list.push([`${v}_walk_${i}`, front, DP({ bob: i % 2 ? -1 : 0, legs: [i === 0 ? 3 : 0, i === 2 ? 3 : 0], tail: i * 1.5 })]);
  }
  const FLAP = [1, 0.55, 0, -0.6, -1, -0.2];
  for (let i = 0; i < 6; i++) { list.push([`back_fly_${i}`, false, DP({ wing: 'spread', flap: FLAP[i], tail: i, bob: -FLAP[i] * 2 })]); list.push([`rider_fly_${i}`, false, DP({ wing: 'spread', flap: FLAP[i], tail: i, bob: -FLAP[i] * 2, rider: true })]); }
  list.push(['rider_idle_0', false, DP({ rider: true })]);
  const cols = 8, rows = Math.ceil(list.length / cols), pix = new Pix(cols * DRG_W, rows * DRG_H), frames: Frames = {};
  list.forEach(([n, front, q], i) => {
    const c = new Pix(DRG_W, DRG_H); dragonView(c, front, ph, scale, q, rider); c.outline(OUT);
    const x = (i % cols) * DRG_W, y = Math.floor(i / cols) * DRG_H; pix.blit(c, x, y); frames[n] = { x, y, w: DRG_W, h: DRG_H };
  });
  return { pix, frames };
}
