import Phaser from 'phaser';
import { ensureAirArt } from '../art/airforce';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import { hud } from '../core/hud';
import type { World } from '../core/world';
import type { Element } from '../dragons/genetics/types';
import { makeBody, type Body } from '../physics/Body';
import { approach, clamp } from '../utils/rng';
import type { ItemId } from '../world/islands/types';
import type { EnemyLike } from './Enemy';

/** A big fiery explosion with debris and smoke: used for downed raiders, the war balloon and bombs. */
export function boom(w: World, x: number, y: number, scale = 1, shake = 3): void {
  w.vfx.play('explosion', x, y + 30 * scale, { scale });
  w.vfx.puff(x, y, 0xffb040, Math.round(10 * scale), { speed: 170 * scale, gravity: 80, life: 420, spread: 360, add: true });
  w.vfx.puff(x, y, 0x3a3230, Math.round(8 * scale), { speed: 90 * scale, gravity: -30, life: 900, spread: 360 });
  audio.play('fire', 0.9); audio.play('quake', 0.5 * scale);
  w.shake(shake, 200);
}

export interface AirHooks { spawnRaider(x: number, y: number): void; downed(kind: string, x: number, y: number): void; /** keep the camera on this point for a while */ track(p: { x: number; y: number }, ms: number): void }

/**
 * Sky raider: a Scale Hunter on a leather glider. Keeps its distance, fires harpoons, and now and then
 * dives through in a strafing run. Shot down, it spirals away trailing smoke and blows up.
 */
export class SkyRaider implements EnemyLike {
  kind = 'skyraider'; alive = true; aggro = true; hp = 4; drop: ItemId | null = 'coin'; contactDmg = 1;
  body: Body; private sprite: Phaser.GameObjects.Sprite;
  private t = Math.random() * 6; private cd = 1.2 + Math.random(); private diveCd = 4 + Math.random() * 3; private diveT = 0; private atkT = 0; private flash = 0; private side = Math.random() < 0.5 ? -1 : 1;
  constructor(private w: World, x: number, y: number) {
    ensureAirArt(w.scene);
    this.body = makeBody(x, y, 30, 22);
    this.sprite = w.scene.add.sprite(x, y, 'skyraider', 'g0').setOrigin(0.5, 0.8).setDepth(DEPTH.entities + 2);
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 11 }; }
  update(dt: number, px: number, py: number, playerAlive: boolean): { contact: boolean; shoot: boolean } {
    const out = { contact: false, shoot: false }, b = this.body, w = this.w;
    if (!this.alive) return out;
    this.t += dt; this.cd -= dt; this.diveCd -= dt; this.diveT -= dt; this.atkT -= dt; this.flash -= dt;
    const dx = px - b.x, dy = py - 14 - b.y, dist = Math.hypot(dx, dy) || 1;
    if (this.diveT > 0) { out.contact = playerAlive && dist < 26; }
    else {
      if (this.diveCd <= 0 && dist < 260) { this.diveCd = 5 + Math.random() * 3; this.diveT = 0.7; b.vx = (dx / dist) * 330; b.vy = (dy / dist) * 330; audio.play('dash', 0.5); }
      else {
        if (Math.random() < dt * 0.15) this.side = -this.side;
        const tx = px + this.side * 150, ty = py - 40 + Math.sin(this.t * 1.3) * 46;
        b.vx = approach(b.vx, clamp((tx - b.x) * 1.6, -210, 210), 260 * dt); b.vy = approach(b.vy, clamp((ty - b.y) * 1.6, -170, 170), 260 * dt);
      }
      if (this.cd <= 0 && dist < 340 && playerAlive) {
        this.cd = 1.3 + Math.random() * 0.9; this.atkT = 0.3;
        const sp = 280, a = Math.atan2(dy, dx);
        w.spawnProjectile({ x: b.x + Math.sign(dx) * 14, y: b.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: 1, element: 'physical', friendly: false, fx: 'icelance', tint: 0xe8dcc0, scale: 0.42, life: 1.6, radius: 7, trail: 0xa89880 });
        audio.play('dash', 0.35);
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    const face = this.diveT > 0 ? Math.sign(b.vx) : Math.sign(dx);
    this.sprite.setPosition(Math.round(b.x), Math.round(b.y)).setFlipX(face < 0).setFrame(this.atkT > 0 ? 'atk' : Math.sin(this.t * 6) > 0 ? 'g0' : 'g1')
      .setRotation(clamp(b.vy / 600, -0.4, 0.4) * (face || 1));
    if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    return out;
  }
  hurt(dmg: number, fromX: number, element: Element | 'physical'): boolean {
    if (!this.alive) return false;
    this.hp -= dmg * (element === 'fire' || element === 'storm' ? 2 : 1); this.flash = 0.1;
    this.body.vx += Math.sign(this.body.x - fromX || 1) * 160;
    this.w.vfx.play('hit', this.body.x, this.body.y - 8, { scale: 0.7 }); audio.play('hit');
    if (this.hp <= 0) this.die();
    return true;
  }
  stagger(): void { this.diveT = 0; this.cd = 1.5; }
  /** Spiral down trailing smoke, then explode. */
  private die(): void {
    this.alive = false;
    const w = this.w, s = this.sprite, sc = w.scene, dir = Math.sign(this.body.vx) || 1;
    s.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0x9a6a5a);
    const smoke = sc.time.addEvent({ delay: 45, repeat: 24, callback: () => w.vfx.puff(s.x, s.y - 6, Math.random() < 0.4 ? 0xff8030 : 0x403834, 2, { speed: 20, gravity: -40, life: 600, spread: 120 }) });
    sc.tweens.add({ targets: s, x: s.x + dir * 90, y: s.y + 160, rotation: dir * 5, duration: 1100, ease: 'Quad.In', onComplete: () => { smoke.remove(); boom(w, s.x, s.y, 0.7, 3); s.destroy(); } });
  }
}

/**
 * War balloon: the Scale Hunters' flying fortress. Hovers over its stretch of sky, lobs cannonballs,
 * drops bombs on anything below and launches raiders. Downed, it bursts in a chain of explosions and falls.
 */
export class Warship implements EnemyLike {
  kind = 'warship'; alive = true; aggro = true; hp = 60; readonly max = 60; drop: ItemId | null = null; contactDmg = 0;
  body: Body; private sprite: Phaser.GameObjects.Sprite; focus: { x: number; y: number } | null = null;
  private t = 0; private cannonCd = 2; private bombCd = 1; private launchCd = 5; private flash = 0; private dir = -1; private engaged = false;
  /** `airborne` tells whether the player is up in the air: the balloon only fights riders */
  constructor(private w: World, private ax: number, private ay: number, private airborne: () => boolean, private hooks: AirHooks) {
    ensureAirArt(w.scene);
    this.body = makeBody(ax, ay, 150, 96);
    this.sprite = w.scene.add.sprite(ax, ay, 'warship', 'w0').setOrigin(0.5, 1).setDepth(DEPTH.entities + 1);
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 48 }; }
  get raidersHint(): number { return this.launchCd; }
  update(dt: number, px: number, py: number, playerAlive: boolean): { contact: boolean; shoot: boolean } {
    const out = { contact: false, shoot: false }, b = this.body, w = this.w;
    if (!this.alive) return out;
    this.t += dt; this.flash -= dt;
    const dx = px - b.x, dist = Math.hypot(dx, py - (b.y - 48));
    this.engaged = playerAlive && dist < 560 && this.airborne();
    this.focus = this.engaged ? { x: b.x, y: b.y - 50 } : null;
    hud.boss = this.engaged ? { name: 'Balão de Guerra', hp: this.hp, max: this.max } : hud.boss?.name === 'Balão de Guerra' ? null : hud.boss;
    // drift toward the player inside its patrol, bobbing
    const tx = clamp(px, this.ax - 320, this.ax + 320);
    b.vx = approach(b.vx, clamp((tx - b.x) * 0.4, -38, 38), 30 * dt);
    b.x += b.vx * dt; b.y = this.ay + Math.sin(this.t * 0.9) * 8;
    if (Math.abs(dx) > 30) this.dir = Math.sign(dx);
    if (this.engaged) {
      this.cannonCd -= dt; this.bombCd -= dt; this.launchCd -= dt;
      if (this.cannonCd <= 0) {
        this.cannonCd = 2.2;
        for (let k = 0; k < 2; k++) w.scene.time.delayedCall(k * 260, () => this.cannon(px + (k ? 40 : -20), py));
      }
      if (this.bombCd <= 0 && Math.abs(dx) < 110 && py > b.y) {
        this.bombCd = 0.9;
        w.spawnProjectile({ x: b.x + (Math.random() - 0.5) * 60, y: b.y - 4, vx: b.vx, vy: 40, gravity: 420, dmg: 1, element: 'fire', friendly: false, fx: 'plasma', tint: 0x2a2420, add: false, scale: 0.22, life: 3, radius: 8, trail: 0x6a6058,
          aoe: { r: 40, dmg: 1, fx: 'explosion', scale: 0.55, knock: 1.4, shake: 3 } });
      }
      if (this.launchCd <= 0) { this.launchCd = 9; this.hooks.spawnRaider(b.x - this.dir * 60, b.y - 40); this.hooks.spawnRaider(b.x - this.dir * 20, b.y - 70); w.vfx.puff(b.x, b.y - 40, 0xffffff, 8, { speed: 60 }); audio.play('flap', 0.6); }
    }
    this.sprite.setPosition(Math.round(b.x), Math.round(b.y)).setFlipX(this.dir < 0).setFrame(Math.floor(this.t * 12) % 2 ? 'w1' : 'w0');
    if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    return out;
  }
  /** Lob a cannonball on a ballistic arc that lands near (tx, ty). */
  private cannon(tx: number, ty: number): void {
    if (!this.alive) return;
    const b = this.body, x = b.x + this.dir * 50, y = b.y - 12, T = 1.05, g = 260;
    const vx = (tx - x) / T, vy = (ty - 14 - y) / T - 0.5 * g * T;
    this.w.spawnProjectile({ x, y, vx, vy, gravity: g, dmg: 1, element: 'fire', friendly: false, fx: 'plasma', tint: 0x2a2420, add: false, scale: 0.24, life: 2.4, radius: 9, trail: 0x8a8078,
      aoe: { r: 36, dmg: 1, fx: 'explosion', scale: 0.5, knock: 1.4, shake: 2 } });
    this.w.vfx.play('explosion', x + this.dir * 6, y + 10, { scale: 0.22, add: true }); this.w.vfx.puff(x, y, 0xd8d0c0, 6, { speed: 50, gravity: -20, life: 500 });
    audio.play('quake', 0.35);
  }
  hurt(dmg: number, _fromX: number, element: Element | 'physical'): boolean {
    if (!this.alive) return false;
    this.hp -= dmg * (element === 'fire' ? 1.6 : element === 'storm' ? 1.3 : 1); this.flash = 0.06;
    const hx = this.body.x + (Math.random() - 0.5) * 120, hy = this.body.y - 20 - Math.random() * 70;
    this.w.vfx.play('hit', hx, hy, { scale: 0.8 }); if (Math.random() < 0.35) this.w.vfx.puff(hx, hy, 0x403834, 4, { speed: 30, gravity: -30, life: 700 });
    audio.play('hit');
    if (this.hp <= 0) this.die();
    return true;
  }
  stagger(): void { /* too big to stagger */ }
  private die(): void {
    this.alive = false; this.focus = null; if (hud.boss?.name === 'Balão de Guerra') hud.boss = null;
    const w = this.w, s = this.sprite, sc = w.scene, b = this.body;
    // a chain of blasts along the envelope and the gondola…
    for (let k = 0; k < 8; k++) sc.time.delayedCall(k * 170, () => { boom(w, s.x + (Math.random() - 0.5) * 140, s.y - 20 - Math.random() * 80, 0.6 + Math.random() * 0.4, 4); w.flash(80, 0xffa040); });
    // …then it drops, burning, and blows apart
    const smoke = sc.time.addEvent({ delay: 60, repeat: 40, callback: () => w.vfx.puff(s.x + (Math.random() - 0.5) * 120, s.y - 60, Math.random() < 0.5 ? 0xff7a30 : 0x3a3230, 3, { speed: 30, gravity: -50, life: 900, spread: 120 }) });
    sc.tweens.add({ targets: s, y: s.y + 120, rotation: this.dir * 0.45, delay: 700, duration: 1150, ease: 'Quad.In', onComplete: () => {
      smoke.remove(); boom(w, s.x, s.y - 30, 1.6, 9); boom(w, s.x - 50, s.y - 10, 1, 0); boom(w, s.x + 50, s.y - 10, 1, 0); w.flash(200, 0xffc060); w.hitstop(0.12);
      this.hooks.downed('warship', s.x, s.y); s.destroy();
    } });
    this.hooks.downed('warship-hit', b.x, b.y); this.hooks.track(s, 3200);
  }
}
