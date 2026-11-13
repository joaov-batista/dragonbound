import type Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import type { Foe, World } from '../core/world';
import type { Element } from './genetics/types';
import type { Dragon } from './Dragon';

/**
 * Dragon battle moves, shared by the ridden mount and bonded dragons fighting on their own:
 *  - melee combo (claw → slash → finisher): on the ground a tail slam, in the air a spinning wing slap
 *  - quick elemental shot ("tiro"), auto-aimed at the nearest foe in front
 *  - charged power orb ("bola de poder"): hold to charge, release to fire; bursts in an area
 * Every hit has hitstop, shake and element-coloured sparks; foes get knocked back hard.
 */
export const EL_COLOR: Record<Element, number> = { fire: 0xff8a30, water: 0x5ac8ff, nature: 0x8fe07a, storm: 0xc8b0ff, earth: 0xd0a868, ice: 0xbff0ff };
const SFX: Record<Element, 'fire' | 'water' | 'spore' | 'zap' | 'quake' | 'ice'> = { fire: 'fire', water: 'water', nature: 'spore', storm: 'zap', earth: 'quake', ice: 'ice' };
const SHOT_FX: Record<Element, [string, number]> = { fire: ['fireball', 0.55], water: ['waterjet', 0.45], nature: ['leafstorm', 0.42], storm: ['sparkarc', 0.5], earth: ['dirt', 0.45], ice: ['icelance', 0.55] };
const ORB_BURST: Record<Element, [string, number]> = { fire: ['explosion', 1.1], water: ['wavecrash', 0.9], nature: ['leafstorm', 1.2], storm: ['thunder', 1], earth: ['earthspike', 1], ice: ['frostnova', 1] };

export interface CombatState { combo: number; comboT: number; atkCd: number; shotCd: number; hold: number; charge: number; chargeFx: Phaser.GameObjects.Sprite | null; spinT: number }
export const newCombat = (): CombatState => ({ combo: 0, comboT: 0, atkCd: 0, shotCd: 0, hold: 0, charge: 0, chargeFx: null, spinT: 0 });

export function tickCombat(c: CombatState, dt: number): void { c.comboT -= dt; c.atkCd -= dt; c.shotCd -= dt; c.spinT -= dt; }

/** Nearest live foe within `range`, preferring the side the dragon faces. */
export function nearestFoe(w: World, x: number, y: number, facing: number, range: number, frontOnly = false): Foe | null {
  let best: Foe | null = null, bd = range;
  for (const f of w.foes()) {
    const dx = f.body.x - x, dy = f.body.y - f.body.h * 0.5 - y;
    if (frontOnly && Math.sign(dx) !== facing && Math.abs(dx) > 20) continue;
    const d = Math.hypot(dx, dy) * (Math.sign(dx) === facing ? 1 : 1.4);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/** Claw / slash / finisher. Lunges toward a nearby foe so it is easy to connect. */
export function melee(d: Dragon, friendly = true): void {
  const c = d.combat, w = d.world, b = d.body, el = d.ph.element, s = Math.max(0.75, d.scale), col = EL_COLOR[el];
  if (c.atkCd > 0) return;
  const step = c.comboT > 0 ? (c.combo + 1) % 3 : 0;
  c.combo = step; c.comboT = 0.7; c.atkCd = step === 2 ? 0.42 : 0.2;
  const tgt = nearestFoe(w, b.x, b.y - b.h * 0.5, d.facing, 130);
  if (tgt) { d.facing = Math.sign(tgt.body.x - b.x) || d.facing; const dx = tgt.body.x - b.x; b.vx += Math.sign(dx) * Math.min(260, Math.abs(dx) * 3.2); if (d.air) b.vy += Math.max(-160, Math.min(160, (tgt.body.y - b.y) * 2.2)); }
  else b.vx += d.facing * (d.air ? 140 : 90);
  const f = d.facing, power = Math.max(1, Math.round(d.ph.stats.power / 7));
  let rect: { x: number; y: number; w: number; h: number }, dmg = power, knock = 1.3, launch = 0;
  if (step < 2) {
    const reach = 66 * s;
    rect = { x: f > 0 ? b.x : b.x - reach, y: b.y - b.h - 18 * s, w: reach, h: b.h + 30 * s };
    w.vfx.play(step === 0 ? 'claw' : 'slash2', b.x + f * 26 * s, b.y - b.h * 0.6, { flip: f < 0, scale: s * (step === 0 ? 1 : 0.9), follow: b, tint: step === 1 ? col : undefined });
    audio.play('slash', 0.9);
  } else if (d.air) {
    // flying wing slap: a full spin that swats everything around the dragon
    const r = 74 * s; dmg = power * 2; knock = 2.6; launch = 160;
    rect = { x: b.x - r, y: b.y - b.h * 0.5 - r * 0.7, w: r * 2, h: r * 1.4 };
    w.vfx.play('spin', b.x, b.y - b.h * 0.5, { scale: s * 1.2, follow: b, tint: col, add: true });
    w.vfx.play('cleave', b.x + f * 30 * s, b.y - b.h * 0.5, { flip: f < 0, scale: s, follow: b });
    c.spinT = 0.32; audio.play('dash', 0.8); audio.play('slash', 1);
  } else {
    // tail slam: shockwave on both sides
    const r = 86 * s; dmg = power * 2; knock = 2.2; launch = 240;
    rect = { x: b.x - r, y: b.y - 46 * s, w: r * 2, h: 50 * s };
    w.vfx.play('slam', b.x + f * 18 * s, b.y, { scale: s * 1.1 }); w.vfx.play('quake', b.x, b.y, { scale: s * 0.9 });
    w.vfx.puff(b.x, b.y, 0xcab894, 14, { speed: 140, gravity: 260, spread: 120, life: 500 });
    audio.play('quake', 0.9); w.shake(4, 160);
  }
  const hits = w.strike(rect, dmg, step === 2 ? el : 'physical', friendly, b.x, 'dragon', d, { knock, launch });
  if (hits > 0) {
    w.hitstop(step === 2 ? 0.09 : 0.045); w.shake(step === 2 ? 5 : 2, step === 2 ? 220 : 90);
    w.vfx.puff(b.x + f * 46 * s, b.y - b.h * 0.6, col, step === 2 ? 16 : 6, { speed: 150, gravity: 120, spread: 160, life: 380, add: true });
    if (step === 2) { w.flash(90, col); audio.play('crit', 0.8); }
  }
}

/** Quick elemental shot; aim follows the stick's vertical axis, homes gently onto the nearest foe in front. */
export function shoot(d: Dragon, aimY = 0, friendly = true): void {
  const c = d.combat, w = d.world, el = d.ph.element, m = d.mouth, b = d.body;
  if (c.shotCd > 0) return;
  c.shotCd = 0.2;
  const tgt = nearestFoe(w, m.x, m.y, d.facing, 330, true), sp = 430;
  let vx = d.facing * sp, vy = aimY * sp * 0.55;
  if (tgt) { const a = Math.atan2(tgt.body.y - tgt.body.h * 0.5 - m.y, tgt.body.x - m.x); vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
  const [fx, sc] = SHOT_FX[el];
  w.spawnProjectile({ x: m.x, y: m.y, vx: vx + b.vx * 0.4, vy, dmg: Math.max(1, Math.round(d.ph.stats.power / 8)), element: el, friendly, fx, scale: sc * Math.max(0.8, d.scale), life: 0.9, radius: 10, owner: d, seek: tgt, turn: 5, trail: EL_COLOR[el] });
  w.vfx.play('zap', m.x, m.y, { scale: 0.35, tint: EL_COLOR[el], add: true });
  audio.play(SFX[el], 0.55);
  b.vx -= d.facing * 18; // a little recoil
}

/** Hold-to-charge power orb. Call every frame with whether the ability button is down; fires on release. */
export function chargeOrb(d: Dragon, down: boolean, dt: number, aimY = 0, friendly = true): void {
  const c = d.combat, w = d.world, m = d.mouth, col = EL_COLOR[d.ph.element];
  if (down) {
    c.hold += dt;
    if (c.hold > 0.22) {
      c.charge = Math.min(1, c.charge + dt / 0.9);
      if (!c.chargeFx) { c.chargeFx = w.vfx.play('plasma', m.x, m.y, { loop: true, scale: 0.5, tint: col, add: false }); audio.play('fire', 0.3); }
      c.chargeFx?.setPosition(Math.round(m.x + d.facing * 14), Math.round(m.y)).setScale(0.5 + c.charge * 0.7).setAlpha(0.8 + Math.sin(c.hold * 30) * 0.2);
      // energy streams into the mouth from all around
      if (Math.random() < dt * 60) { const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 20; w.vfx.puff(m.x + d.facing * 14 + Math.cos(a) * r, m.y + Math.sin(a) * r, col, 2, { speed: 14, gravity: 0, life: 220, add: true, size: 2 }); }
      if (Math.random() < dt * (3 + c.charge * 8)) w.vfx.play('sparkarc', m.x + d.facing * 14, m.y, { scale: 0.3 + c.charge * 0.3, tint: col, add: true });
      if (c.charge >= 1 && Math.random() < dt * 4) w.vfx.play('zap', m.x, m.y, { scale: 0.5, tint: col, add: true });
    }
    return;
  }
  if (c.hold <= 0) return;
  const tapped = c.hold <= 0.22, charge = c.charge;
  c.hold = 0; c.charge = 0; w.vfx.release(c.chargeFx); c.chargeFx = null;
  if (tapped || charge < 0.25) { shoot(d, aimY, friendly); return; }
  releaseOrb(d, charge, aimY, friendly);
}

/** Fire a power orb of the given charge (0..1). Also used by AI dragons. */
export function releaseOrb(d: Dragon, charge: number, aimY = 0, friendly = true): void {
  const w = d.world, el = d.ph.element, m = d.mouth, col = EL_COLOR[el], b = d.body;
  const tgt = nearestFoe(w, m.x, m.y, d.facing, 380, true), sp = 300;
  let vx = d.facing * sp, vy = aimY * sp * 0.5;
  if (tgt) { const a = Math.atan2(tgt.body.y - tgt.body.h * 0.5 - m.y, tgt.body.x - m.x); vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
  const [bfx, bsc] = ORB_BURST[el], k = 0.5 + charge * 0.5;
  w.spawnProjectile({ x: m.x, y: m.y, vx, vy, dmg: 1, element: el, friendly, fx: 'plasma', tint: col, add: false, scale: 0.6 + charge * 0.6, life: 1.4, radius: 16, owner: d, seek: tgt, turn: 2.2, trail: col,
    aoe: { r: 50 + 40 * charge, dmg: Math.max(2, Math.round((d.ph.stats.power / 3) * k)), fx: bfx, scale: bsc * (0.6 + charge * 0.6), knock: 2 + charge, shake: 3 + charge * 5 } });
  b.vx -= d.facing * (60 + charge * 80); // the recoil pushes the dragon back
  w.shake(1 + charge * 2, 120); audio.play(SFX[el], 1); audio.play('dash', 0.5);
}

/** Cancel a charge in progress (dismount, scene change). */
export function cancelCharge(d: Dragon): void { const c = d.combat; c.hold = 0; c.charge = 0; d.world.vfx.release(c.chargeFx); c.chargeFx = null; }
