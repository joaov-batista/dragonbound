import Phaser from 'phaser';
import { RIDE_HIP_ABOVE_ORIGIN } from '../art/hero';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import type { World } from '../core/world';
import { input } from '../input/InputManager';
import { moveBody } from '../physics/Body';
import { Liquid } from '../physics/TileGrid';
import type { Player } from '../player/Player';
import { approach, clamp } from '../utils/rng';
import type { Dragon } from './Dragon';
import { chargeOrb, melee, tickCombat } from './DragonCombat';

/**
 * Mounted control. On the ground the dragon walks; a flap takes off. In the air the model is
 * energy-based: speed makes lift, diving trades height for speed, climbing spends stamina.
 * Species stats set the envelope; personality + training set how crisply the dragon answers.
 */
export function updateRide(d: Dragon, pl: Player, w: World, dt: number, storm: boolean): void {
  const b = d.body, f = d.flight, st = d.ph.stats, t = d.mind.traits, rec = d.rec, inp = input;
  f.dashCd -= dt; f.breathCd -= dt; f.biteCd -= dt; f.dashT -= dt; f.ghostT -= dt; tickCombat(d.combat, dt);
  // responsiveness: an untrained, independent dragon lags behind the reins
  const resp = clamp(4.5 + rec.training * 0.09 + st.agility * 3.5 - t.independence * 3 + (rec.trust - 85) * 0.08, 2.5, 16);
  const ix = inp.axisX, iy = inp.axisY * (inp.bindings.invertFlightY ? -1 : 1);
  f.sx += (ix - f.sx) * Math.min(1, resp * dt); f.sy += (iy - f.sy) * Math.min(1, resp * dt);
  if (Math.abs(ix) > 0.2) d.facing = Math.sign(ix);
  const maxV = st.flySpeed, wind = w.windAt(b.x, b.y - 20);

  if (!d.air) {
    // ground ride
    const sp = 70 + st.agility * 30;
    b.vx = Math.abs(f.sx) > 0.12 ? approach(b.vx, f.sx * sp, 500 * dt) : approach(b.vx, 0, 700 * dt);
    b.vy = Math.min(b.vy + 800 * dt, 320);
    f.stamina = Math.min(st.stamina, f.stamina + 30 * dt);
    if (inp.pressed('jump') && b.onGround) {
      d.air = true; f.airborne = true; b.vy = -210 - st.agility * 30; f.flapT = 0.35;
      w.vfx.play('land', b.x, b.y, { scale: 0.9 }); w.vfx.puff(b.x, b.y, 0xd8ccb0, 10, { speed: 80 }); audio.play('flap'); d.vocalize('chirp', b.x);
    }
    moveBody(w.grid, b, dt);
    if (b.inLiquid === Liquid.Water && b.submerged) { if (d.ph.canSwim) b.vy = approach(b.vy, -40, 1200 * dt); else { d.air = true; b.vy = -200; w.vfx.play('splash', b.x, b.y - 10); audio.play('splash'); } }
    d.setAnim(Math.abs(b.vx) > 8 ? 'walk' : 'idle');
  } else {
    // ── flight ──
    // Arcade-glide model: stick held = cruise that way, released = brake to a hover; neutral height is held
    // for free, climbing costs stamina, diving converts height into speed. A reversal brakes through zero
    // before the dragon turns, so it reads as a heavy animal rather than a flipping sprite.
    const speed = Math.abs(b.vx), tired = f.stamina <= 0, cruise = maxV * 0.72;
    const ceil = ceilingY(w, b.x);
    const steer = Math.abs(f.sx) > 0.15;
    const wantVx = steer ? Math.sign(f.sx) * cruise * Math.min(1, Math.abs(f.sx) * 1.3) * (1 + f.boost) : 0;
    const reversing = steer && Math.sign(f.sx) !== Math.sign(b.vx) && speed > 30;
    b.vx = approach(b.vx, wantVx, (wantVx === 0 ? 170 : reversing ? 420 + st.agility * 160 : 230 + st.agility * 110) * dt);
    if (reversing && speed < 70 && Math.random() < dt * 20) w.vfx.puff(b.x, b.y - 16, 0xffffff, 1, { speed: 30, gravity: 0, life: 260 });
    let wantVy = tired ? 38 : 0, vyRate = 380;
    if (f.sy < -0.15) { if (!tired) { wantVy = f.sy * (150 + st.agility * 35); f.stamina -= 11 * -f.sy * dt; } }
    else if (f.sy > 0.15) { wantVy = f.sy * 270; vyRate = 560; f.boost = Math.min(0.6, f.boost + dt * 0.6); }
    if (f.sy <= 0.15) f.boost = Math.max(0, f.boost - dt * 0.25);
    // soft ceiling a few screens above the island's highest ground: the air thins and pushes back down
    if (b.y < ceil) { wantVy = Math.max(wantVy, (ceil - b.y) * 1.6); vyRate = 520; if (f.sy < -0.15 && Math.random() < dt * 3) w.vfx.puff(b.x, b.y - 30, 0xffffff, 2, { speed: 20, gravity: 0, life: 400 }); }
    b.vy = approach(b.vy, wantVy, vyRate * dt);
    const flap = inp.pressed('jump') || (inp.down('jump') && f.flapT <= 0);
    f.flapT -= dt;
    if (flap && !tired) { b.vy = Math.min(b.vy, 0) - (150 + st.agility * 40); if (b.y < ceil) b.vy *= 0.3; b.vx += d.facing * 45; f.stamina -= 6; f.flapT = 0.36; f.flapKick = 0.35; audio.play('flap', 0.8); w.vfx.puff(b.x - d.facing * 10, b.y - 10, 0xffffff, 3, { speed: 40, gravity: 60, spread: 40 }); }
    f.flapKick = Math.max(0, f.flapKick - dt);
    // dash: a straight burst along the stick (no spin), with after-images and brief invulnerability
    if (inp.pressed('dash') && f.dashCd <= 0 && f.stamina > 10) {
      f.dashT = 0.26; f.dashCd = 0.8; f.stamina -= 14; f.ghostT = 0;
      const dir = steer ? Math.sign(f.sx) : d.facing, dy = Math.abs(f.sy) > 0.3 ? Math.sign(f.sy) * 0.45 : 0, n = Math.hypot(1, dy);
      b.vx = (dir / n) * Math.max(speed, maxV) * 1.6; b.vy = (dy / n) * maxV * 1.2;
      audio.play('dash'); pl.iframes = Math.max(pl.iframes, 0.35);
      w.vfx.puff(b.x - dir * 16, b.y - 16, 0xffffff, 8, { speed: 70, spread: 60, gravity: 0, life: 300 });
    }
    if (f.dashT > 0) { b.vy *= 1 - 3 * dt; if (f.ghostT <= 0) { f.ghostT = 0.04; ghost(d, pl, w); } }
    // facing follows actual motion; at a hover it follows the stick
    if (speed > 25) d.facing = Math.sign(b.vx); else if (steer) d.facing = Math.sign(f.sx);
    // wind and weather
    b.vx += wind.x * 1.6 * dt; b.vy += wind.y * 2.6 * dt; // gusts and updrafts ride on top of the glide model
    if (wind.y < -40) f.stamina = Math.min(st.stamina, f.stamina + 14 * dt);
    if (storm && !d.ph.abilities.includes('stormRider')) { f.wobble += dt * (3 + (1 - t.courage) * 4); b.vx += Math.sin(f.wobble * 1.7) * 60 * dt; b.vy += Math.cos(f.wobble) * 90 * (1.3 - t.courage) * dt; }
    if (f.sy > -0.15 && b.vy > -20) f.stamina = Math.min(st.stamina, f.stamina + (f.sy > 0.15 ? 9 : 6) * dt);
    const cap = maxV * (1 + f.boost + (f.dashT > 0 ? 0.6 : 0)) * (tired ? 0.6 : 1);
    b.vx = clamp(b.vx, -cap, cap); b.vy = clamp(b.vy, -260, 360);
    moveBody(w.grid, b, dt);
    if (b.inLiquid !== Liquid.None) { // skim the surface instead of sinking
      if (b.inLiquid === Liquid.Lava && !d.ph.abilities.includes('heatProof')) pl.hurt(1, b.x - d.facing);
      b.vy = Math.min(b.vy, -150); w.vfx.play('splash', b.x, b.y - 6, { scale: 0.8 }); audio.play('splash', 0.6);
    }
    if (b.onGround) { d.air = false; f.airborne = false; if (b.landed > 180) { w.vfx.play('land', b.x, b.y); audio.play('land'); w.shake(2); } }
    d.setAnim('fly');
    const climbing = f.sy < -0.15 && !tired, diving = f.sy > 0.3 && f.dashT <= 0, hovering = speed < 40;
    if (diving) { d.sprite.anims.pause(); if (d.sprite.frame.name !== 'fly_1') d.sprite.setFrame('fly_1'); }
    else { if (d.sprite.anims.isPaused) d.sprite.anims.resume(); d.sprite.anims.timeScale = f.flapKick > 0 ? 2 : climbing ? 1.6 : hovering ? 1.35 : tired ? 1.2 : 0.75; }
    // attacks: claw combo ending in a spinning wing slap; tap the ability for shots, hold it for a power orb
    if (inp.pressed('attack')) melee(d);
    chargeOrb(d, inp.down('ability'), dt, f.sy);
    // speed feedback
    const k = clamp(Math.hypot(b.vx, b.vy) / (maxV * 1.2), 0, 1);
    audio.setWindBoost(k);
    if (k > 0.5 && Math.random() < dt * 26 * k) speedStreak(w, b.x - d.facing * (10 + Math.random() * 30), b.y - 6 - Math.random() * 40 * d.scale, b.vx, b.vy, k);
    f.speedK = k;
    // low pass: a fast skim over the ground or the sea kicks up dust or spray behind the wings
    let gy = w.grid.groundBelow(b.x, b.y, 4), water = false;
    for (let yy = b.y + 4; yy < b.y + 72; yy += 6) if (w.grid.liquidAt(b.x, yy) === Liquid.Water) { if (gy === null || yy < gy) { gy = yy; water = true; } break; }
    const gap = gy === null ? 999 : gy - b.y, skimT = gap < 60 && Math.abs(b.vx) > maxV * 0.5 ? (1 - gap / 60) * Math.min(1, Math.abs(b.vx) / maxV) : 0;
    f.skim += (skimT - f.skim) * Math.min(1, dt * 8);
    if (f.skim > 0.15 && gy !== null) {
      f.skimT -= dt;
      if (Math.random() < dt * 40 * f.skim) w.vfx.puff(b.x - d.facing * (6 + Math.random() * 26), gy - 2, water ? 0xe8f6ff : 0xcab894, water ? 3 : 2, { speed: water ? 70 : 45, gravity: water ? 260 : 40, spread: 50, life: water ? 420 : 520 });
      if (water && f.skimT <= 0) { f.skimT = 0.18; w.vfx.play('splash', b.x - d.facing * 18, gy, { scale: 0.45 + f.skim * 0.4 }); }
      if (!water && f.skimT <= 0) { f.skimT = 0.5; audio.play('dash', 0.15 + f.skim * 0.2); }
    }
  }
  if (!d.air) {
    f.speedK = 0; f.skim = 0; audio.setWindBoost(0);
    // on the ground: claw combo ending in a tail slam; the same shots and power orbs
    if (inp.pressed('attack')) { d.setAnim('attack'); melee(d); }
    chargeOrb(d, inp.down('ability'), dt, f.sy);
  }
  // rider + sprite
  d.finish(dt, null);
  // pitch follows the flight path (nose down in a dive, up in a climb), eased so it never snaps
  const target = d.air ? clamp(Math.atan2(b.vy, Math.max(70, Math.abs(b.vx))), -0.6, 0.6) * d.facing : 0;
  f.pitch += (target - f.pitch) * Math.min(1, dt * 7);
  const spin = d.combat.spinT > 0 ? (1 - d.combat.spinT / 0.32) * Math.PI * 2 * d.facing : 0;
  d.sprite.setRotation(f.pitch + spin);
  placeRider(d, pl, Math.abs(b.vx) > maxV * 0.6 || f.dashT > 0);
  rec.energy = clamp(rec.energy - dt / 900);
}

/** Seat the hero on the saddle: hip on the dragon's back, leaning with its pitch. */
export function placeRider(d: Dragon, pl: Player, fast: boolean): void {
  const s = d.saddle;
  pl.facing = d.facing;
  pl.body.x = s.x; pl.body.y = s.y + RIDE_HIP_ABOVE_ORIGIN; pl.body.vx = d.body.vx; pl.body.vy = d.body.vy;
  pl.syncSprite();
  pl.sprite.setFrame(fast ? 'ride_1' : 'ride_0').setRotation(s.rot).setPosition(Math.round(s.x - Math.sin(s.rot) * RIDE_HIP_ABOVE_ORIGIN), Math.round(s.y + Math.cos(s.rot) * RIDE_HIP_ABOVE_ORIGIN)).setVisible(true);
}

function ghost(d: Dragon, pl: Player, w: World): void {
  for (const src of [d.sprite, pl.sprite]) {
    const g = w.scene.add.image(src.x, src.y, src.texture.key, src.frame.name).setOrigin(src.originX, src.originY).setFlipX(src.flipX).setRotation(src.rotation)
      .setDepth(src.depth - 2).setTint(0x9fe8ff).setTintMode(Phaser.TintModes.FILL).setAlpha(0.5);
    w.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }
}

/** World-space streak behind a fast dragon, flying back along its path. */
function speedStreak(w: World, x: number, y: number, vx: number, vy: number, k: number): void {
  const a = Math.atan2(vy, vx), s = w.scene.add.image(x, y, 'ocean', 'streak').setRotation(a).setDepth(DEPTH.vfx - 1).setAlpha(0.25 + k * 0.4).setScale(0.6 + k * 0.6, 1);
  w.scene.tweens.add({ targets: s, x: x - Math.cos(a) * 40, y: y - Math.sin(a) * 40, alpha: 0, duration: 260, onComplete: () => s.destroy() });
}

const ceilings = new WeakMap<object, Float32Array>();
/**
 * Highest flyable altitude above column x: ~10 tiles over the tallest ground nearby (sea counts as ground),
 * smoothed so the limit rolls with the landscape. Keeps terrain on screen however high the rider climbs.
 */
export function ceilingY(w: World, x?: number): number {
  const g = w.grid;
  let c = ceilings.get(g);
  if (!c) {
    const sea = w.island.seaRow, top = new Float32Array(g.w), loc = new Float32Array(g.w);
    c = new Float32Array(g.w);
    for (let tx = 0; tx < g.w; tx++) { let y = 0; while (y < sea && g.cells[y * g.w + tx] !== 1) y++; top[tx] = y; }
    for (let tx = 0; tx < g.w; tx++) { let m = sea; for (let k = -18; k <= 18; k++) m = Math.min(m, top[Math.max(0, Math.min(g.w - 1, tx + k))]); loc[tx] = m - 10; }
    for (let tx = 0; tx < g.w; tx++) { let sum = 0, n = 0; for (let k = -10; k <= 10; k++) { const i = tx + k; if (i >= 0 && i < g.w) { sum += loc[i]; n++; } } c[tx] = (sum / n) * 16; }
    ceilings.set(g, c);
  }
  if (x === undefined) { let m = Infinity; for (const v of c) m = Math.min(m, v); return m; }
  return c[Math.max(0, Math.min(g.w - 1, Math.floor(x / 16)))];
}
