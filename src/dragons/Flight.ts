import Phaser from 'phaser';
import { RIDE_HIP_ABOVE_ORIGIN } from '../art/hero';
import { audio } from '../audio/AudioManager';
import type { World } from '../core/world';
import { input } from '../input/InputManager';
import { moveBody } from '../physics/Body';
import { Liquid } from '../physics/TileGrid';
import type { Player } from '../player/Player';
import { approach, clamp } from '../utils/rng';
import type { Dragon } from './Dragon';

const GRAV = 300;

/**
 * Mounted control. On the ground the dragon walks; a flap takes off. In the air the model is
 * energy-based: speed makes lift, diving trades height for speed, climbing spends stamina.
 * Species stats set the envelope; personality + training set how crisply the dragon answers.
 */
export function updateRide(d: Dragon, pl: Player, w: World, dt: number, storm: boolean): void {
  const b = d.body, f = d.flight, st = d.ph.stats, t = d.mind.traits, rec = d.rec, inp = input;
  f.dashCd -= dt; f.breathCd -= dt; f.biteCd -= dt; f.dashT -= dt; f.ghostT -= dt;
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
    const speed = Math.abs(b.vx), lift = Math.min(1, speed / (maxV * 0.75)) * GRAV * 0.86;
    const tired = f.stamina <= 0;
    b.vx += f.sx * 300 * st.agility * dt;
    if (Math.abs(f.sx) < 0.12) b.vx *= 1 - 0.35 * dt;
    b.vy += (GRAV - lift) * dt;
    if (f.sy < -0.15) { b.vy += f.sy * (tired ? 150 : 460) * dt; f.stamina -= 13 * -f.sy * dt; }         // climb
    if (f.sy > 0.15) { b.vy += f.sy * 520 * dt; b.vx += d.facing * f.sy * 150 * dt; f.boost = Math.min(0.5, f.boost + dt * 0.5); } // dive → speed
    else f.boost = Math.max(0, f.boost - dt * 0.18);
    const flap = inp.pressed('jump') || (inp.down('jump') && f.flapT <= 0);
    f.flapT -= dt;
    if (flap && !tired) { b.vy = Math.min(b.vy, 40) - (130 + st.agility * 40); f.stamina -= 7; f.flapT = 0.36; audio.play('flap', 0.8); w.vfx.puff(b.x - d.facing * 10, b.y - 10, 0xffffff, 3, { speed: 40, gravity: 60, spread: 40 }); }
    // dash: a straight burst along the stick (no spin), with after-images and brief invulnerability
    if (inp.pressed('dash') && f.dashCd <= 0 && f.stamina > 10) {
      f.dashT = 0.26; f.dashCd = 0.8; f.stamina -= 14; f.ghostT = 0;
      const dy = Math.abs(f.sy) > 0.3 ? Math.sign(f.sy) * 0.45 : 0, n = Math.hypot(1, dy);
      b.vx = (d.facing / n) * Math.max(speed, maxV) * 1.6; b.vy = (dy / n) * maxV * 1.2;
      audio.play('dash'); pl.iframes = Math.max(pl.iframes, 0.35);
      w.vfx.puff(b.x - d.facing * 16, b.y - 16, 0xffffff, 8, { speed: 70, spread: 60, gravity: 0, life: 300 });
    }
    if (f.dashT > 0) { b.vy *= 1 - 3 * dt; if (f.ghostT <= 0) { f.ghostT = 0.04; ghost(d, pl, w); } }
    // wind and weather
    b.vx += wind.x * 1.6 * dt; b.vy += wind.y * 1.9 * dt;
    if (wind.y < -40) f.stamina = Math.min(st.stamina, f.stamina + 14 * dt);
    if (storm && !d.ph.abilities.includes('stormRider')) { f.wobble += dt * (3 + (1 - t.courage) * 4); b.vx += Math.sin(f.wobble * 1.7) * 60 * dt; b.vy += Math.cos(f.wobble) * 90 * (1.3 - t.courage) * dt; }
    if (Math.abs(f.sy) < 0.15 && b.vy > -20) f.stamina = Math.min(st.stamina, f.stamina + 5 * dt);
    const cap = maxV * (1 + f.boost + (f.dashT > 0 ? 0.6 : 0)) * (tired ? 0.6 : 1);
    b.vx = clamp(b.vx, -cap, cap); b.vy = clamp(b.vy, -250, 340);
    moveBody(w.grid, b, dt);
    if (b.inLiquid !== Liquid.None) { // skim the surface instead of sinking
      if (b.inLiquid === Liquid.Lava && !d.ph.abilities.includes('heatProof')) pl.hurt(1, b.x - d.facing);
      b.vy = Math.min(b.vy, -150); w.vfx.play('splash', b.x, b.y - 6, { scale: 0.8 }); audio.play('splash', 0.6);
    }
    if (b.onGround) { d.air = false; f.airborne = false; if (b.landed > 180) { w.vfx.play('land', b.x, b.y); audio.play('land'); w.shake(2); } }
    d.setAnim('fly');
    // attacks
    if (inp.pressed('attack') && f.biteCd <= 0) { f.biteCd = 0.45; w.vfx.play('claw', b.x + d.facing * 20 * d.scale, b.y - 4, { flip: d.facing < 0, follow: b }); audio.play('slash'); w.strike({ x: d.facing > 0 ? b.x : b.x - 60, y: b.y - 44, w: 60, h: 52 }, 2, 'physical', true, b.x, 'dragon', d); }
    if (inp.pressed('ability') && f.breathCd <= 0 && f.stamina > 8) {
      f.breathCd = 0.7; f.stamina -= 8;
      const ang = Math.atan2(b.vy * 0.4 + f.sy * 120, Math.abs(b.vx) + 200);
      d.breathe(true, d.facing * Math.cos(ang) * 330 + b.vx * 0.5, Math.sin(ang) * 330);
    }
    // speed feedback
    const k = clamp(Math.hypot(b.vx, b.vy) / (maxV * 1.2), 0, 1);
    audio.setWindBoost(k);
    if (k > 0.7 && Math.random() < dt * 30 * k) w.vfx.puff(b.x - d.facing * (20 + Math.random() * 20), b.y - 10 - Math.random() * 30, 0xffffff, 1, { speed: 10, gravity: 0, life: 260, size: 3 });
  }
  if (!d.air) { if (inp.pressed('ability') && f.breathCd <= 0) { f.breathCd = 1; d.setAnim('attack'); d.strike(true); } audio.setWindBoost(0); }
  // rider + sprite
  d.finish(dt, null);
  const tilt = d.air ? clamp(b.vy / 320, -0.55, 0.55) * d.facing : 0;
  d.sprite.setRotation(tilt);
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
