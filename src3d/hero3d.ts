import * as THREE from 'three';
import { Pix } from '../src/art/Pix';
import { HERO_STYLE, paintHeroSheet, type HeroStyle } from '../src/art/hero';
import { audio } from '../src/audio/AudioManager';
import { Billboard, blobShadow, facesRight, viewFor } from './billboard';
import { input } from './input';
import { pixTexture } from './pixtex';
import { HERO_CELL, HERO_FEET, NO_GEAR, paintHeroViews, type Frames, type Gear } from './views';
import { SEA, height } from './world';

export type Motion = 'still' | 'sneak' | 'walk' | 'run';

/** Side frames (from the 2D painter) + front/back views in one sheet, for any person: hero, villagers, hunters. */
export function personSheet(style: HeroStyle, gear: Gear): { tex: THREE.Texture; frames: Frames } {
  const side = paintHeroSheet(style), views = paintHeroViews(style, gear);
  const pix = new Pix(Math.max(side.pix.w, views.pix.w), side.pix.h + views.pix.h);
  pix.blit(side.pix, 0, 0); pix.blit(views.pix, 0, side.pix.h);
  const frames: Frames = {};
  for (const [k, f] of Object.entries(side.frames)) frames['side_' + k] = f;
  for (const [k, f] of Object.entries(views.frames)) frames[k] = { ...f, y: f.y + side.pix.h };
  return { tex: pixTexture(pix), frames };
}

/** Weapons, shields and armour (the hero's kit). */
export const SWORDS = { none: { name: 'Mãos', atk: 4, reach: 1.8 }, wood: { name: 'Espada de treino', atk: 8, reach: 2.3 }, iron: { name: 'Espada de ferro', atk: 14, reach: 2.5 }, fire: { name: 'Lâmina Flamejante', atk: 17, reach: 2.7 } } as const;
export const SHIELDS = { none: { name: 'Sem escudo', block: 0.5, parry: 0.12 }, wood: { name: 'Escudo de madeira', block: 0.3, parry: 0.2 }, iron: { name: 'Escudo de ferro', block: 0.15, parry: 0.22 }, scale: { name: 'Escudo de escamas', block: 0.05, parry: 0.26 } } as const;
export const ARMORS = { cloth: { name: 'Roupas', def: 0 }, leather: { name: 'Couro', def: 0.15 }, iron: { name: 'Cota de ferro', def: 0.3 }, scale: { name: 'Armadura de escamas', def: 0.45 } } as const;

export type Act = 'none' | 'attack' | 'heavy' | 'block' | 'roll' | 'hurt';

/** The hero on foot: camera-relative movement, sneaking, jumping, food, petting, and sword-and-shield combat. */
export class Hero {
  pos = new THREE.Vector3(); vel = new THREE.Vector3(); heading = 0; onGround = true;
  motion: Motion = 'still'; offering = false; petT = 0; hp = 100; maxHp = 100; iframes = 0; mounted = false;
  stamina = 100; staminaMax = 100; private stamWait = 0;
  act: Act = 'none'; actT = 0; combo = 0; private comboT = 0; hold = 0; blockT = 0; swingId = 0; hitWindow = false;
  style: HeroStyle = HERO_STYLE; gear: Gear = { ...NO_GEAR };
  bb: Billboard; readonly shadow: THREE.Mesh; sheet: { tex: THREE.Texture; frames: Frames };
  private t = 0; private stepT = 0; private stillT = 0;

  constructor(private scene: THREE.Scene) {
    this.sheet = personSheet(this.style, this.gear);
    this.bb = new Billboard(this.sheet.tex, this.sheet.frames, HERO_CELL, HERO_CELL, HERO_FEET, 23);
    this.shadow = blobShadow(1.1);
    scene.add(this.bb.mesh, this.shadow);
  }
  /** Repaint every hero sprite after the look or the equipment changes. */
  setLook(style: HeroStyle, gear: Gear): void {
    this.style = style; this.gear = gear;
    this.scene.remove(this.bb.mesh); this.bb.mat.dispose();
    this.sheet = personSheet(style, gear);
    this.bb = new Billboard(this.sheet.tex, this.sheet.frames, HERO_CELL, HERO_CELL, HERO_FEET, 23);
    this.scene.add(this.bb.mesh);
  }
  get still(): boolean { return this.stillT > 0.25; }
  get blocking(): boolean { return this.act === 'block'; }
  /** True during the first instants of raising the shield: a perfect block. */
  get parrying(): boolean { return this.act === 'block' && this.blockT < SHIELDS[this.gear.shield].parry; }
  get rolling(): boolean { return this.act === 'roll' && this.actT < 0.32; }
  spend(n: number): boolean { if (this.stamina < n * 0.5) return false; this.stamina = Math.max(0, this.stamina - n); this.stamWait = 0.6; return true; }

  update(dt: number, camYaw: number, lockAt: THREE.Vector3 | null): void {
    this.t += dt; this.iframes -= dt; this.petT -= dt; this.comboT -= dt; this.actT += dt; this.stamWait -= dt;
    if (this.stamWait <= 0) this.stamina = Math.min(this.staminaMax, this.stamina + 30 * dt * (this.act === 'block' ? 0.35 : 1));
    const mx = input.mx, my = input.my, mag = Math.min(1, Math.hypot(mx, my));
    const sneak = input.is('sneak');
    const busy = this.act === 'attack' || this.act === 'heavy' || this.act === 'roll' || this.act === 'hurt';
    // ── combat input (Peregrinos-style): tap = combo, hold = heavy; hold block; roll ──
    const atkDown = input.is('melee') || input.is('shoot');
    if (atkDown && !busy && this.act !== 'block') this.hold += dt;
    if (!atkDown && this.hold > 0) {
      if (this.hold > 0.45 && this.spend(30)) this.start('heavy');
      else if (this.spend(12)) { this.combo = this.comboT > 0 ? (this.combo + 1) % 3 : 0; this.start('attack'); }
      this.hold = 0;
    }
    if (input.is('block') && !busy && this.onGround) { if (this.act !== 'block') { this.act = 'block'; this.blockT = 0; audio.play('ui', 0.4); } this.blockT += dt; }
    else if (this.act === 'block') this.act = 'none';
    if (input.pressed('dash') && this.act !== 'roll' && this.act !== 'hurt' && this.onGround && this.spend(22)) {
      this.start('roll'); this.iframes = Math.max(this.iframes, 0.32);
      const a = mag > 0.1 ? Math.atan2(mx, my) + camYaw : this.heading; this.heading = a;
      this.vel.x = Math.sin(a) * 10; this.vel.z = Math.cos(a) * 10; audio.play('dash', 0.6);
    }
    if ((this.act === 'attack' && this.actT > 0.34) || (this.act === 'heavy' && this.actT > 0.6) || (this.act === 'roll' && this.actT > 0.45) || (this.act === 'hurt' && this.actT > 0.35)) { if (this.act === 'attack') this.comboT = 0.45; this.act = 'none'; }
    this.hitWindow = (this.act === 'attack' && this.actT > 0.07 && this.actT < 0.2) || (this.act === 'heavy' && this.actT > 0.25 && this.actT < 0.42);
    // ── movement ──
    this.offering = input.is('food') && this.onGround && !busy;
    const speed = this.offering ? 0 : this.act === 'block' ? 2 : sneak ? 2.2 : 6;
    if (this.act === 'roll') { this.vel.x *= Math.max(0, 1 - dt * 3); this.vel.z *= Math.max(0, 1 - dt * 3); this.motion = 'walk'; this.stillT = 0; }
    else if (busy) { this.vel.x *= Math.max(0, 1 - dt * 14); this.vel.z *= Math.max(0, 1 - dt * 14); }
    else if (mag > 0.1 && !this.offering) {
      const a = Math.atan2(mx, my) + camYaw;
      this.heading = turnTo(this.heading, lockAt && this.act === 'block' ? Math.atan2(lockAt.x - this.pos.x, lockAt.z - this.pos.z) : a, dt * 12);
      const tx = Math.sin(a) * speed * mag, tz = Math.cos(a) * speed * mag;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * 10); this.vel.z += (tz - this.vel.z) * Math.min(1, dt * 10);
      this.motion = sneak ? 'sneak' : 'walk'; this.stillT = 0;
    } else { this.vel.x *= Math.max(0, 1 - dt * 12); this.vel.z *= Math.max(0, 1 - dt * 12); this.motion = 'still'; this.stillT += dt; }
    if (input.pressed('jump') && this.onGround && !this.offering && !busy) { this.vel.y = 6.2; this.onGround = false; audio.play('jump', 0.6); this.stillT = 0; }
    this.vel.y -= 18 * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (height(nx, nz) > SEA - 0.6) { this.pos.x = nx; this.pos.z = nz; } else { this.vel.x = this.vel.z = 0; }
    this.pos.y += this.vel.y * dt;
    const g = Math.max(height(this.pos.x, this.pos.z), SEA - 0.5);
    if (this.pos.y <= g) { if (!this.onGround && this.vel.y < -6) audio.play('land', 0.5); this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y > g + 0.3) this.onGround = false;
    if (this.onGround && this.motion !== 'still' && this.act !== 'roll' && (this.stepT -= dt) <= 0) { this.stepT = this.motion === 'sneak' ? 0.5 : 0.32; audio.play('step', this.motion === 'sneak' ? 0.15 : 0.3); }
  }
  private start(a: Act): void {
    this.act = a; this.actT = 0; this.swingId++;
    if (a === 'attack' || a === 'heavy') { audio.play('slash', a === 'heavy' ? 1 : 0.7); const lunge = a === 'heavy' ? 5 : 3.5; this.vel.x = Math.sin(this.heading) * lunge; this.vel.z = Math.cos(this.heading) * lunge; }
  }
  /** Took a hit: flinch (no flinch when the armour holds or while rolling). */
  flinch(): void { if (this.act !== 'block') { this.act = 'hurt'; this.actT = 0; } }

  render(cam: THREE.Camera, tint: THREE.Color): void {
    const p = this.pos, b = this.bb;
    b.mesh.position.copy(p); b.mesh.visible = !this.mounted;
    this.shadow.position.set(p.x, Math.max(height(p.x, p.z), SEA) + 0.04, p.z); this.shadow.visible = !this.mounted;
    if (this.mounted) return;
    const view = viewFor(this.heading, cam.position, p), moving = this.motion !== 'still';
    const k = this.actT;
    if (view === 'side') {
      let name: string;
      if (this.act === 'attack') { const a = ['attack1', 'attack2', 'attack3'][this.combo], n = this.combo === 2 ? 5 : 4; name = `${a}_${Math.min(n - 1, Math.floor(k / 0.34 * n))}`; }
      else if (this.act === 'heavy') name = `attack3_${Math.min(4, Math.floor(k / 0.6 * 5))}`;
      else if (this.act === 'block') name = `parry_${Math.min(2, Math.floor(this.blockT * 10))}`;
      else if (this.act === 'roll') name = `dash_${Math.floor(k * 8) % 2}`;
      else if (this.act === 'hurt') name = 'hurt_0';
      else {
        const a = this.offering ? 'offer' : this.petT > 0 ? 'pet' : !this.onGround ? (this.vel.y > 0 ? 'jump' : 'fall') : this.motion === 'sneak' ? 'sneak' : moving ? 'run' : 'idle';
        const n = { idle: 6, run: 8, sneak: 6, offer: 2, pet: 4, jump: 2, fall: 2 }[a], fps = a === 'run' ? 14 : a === 'sneak' ? 8 : 6;
        name = `${a}_${Math.floor(this.t * fps) % n}`;
      }
      b.set('side_' + name, !facesRight(this.heading, cam));
    } else {
      let a: string, n: number, fps: number;
      if (this.act === 'attack' || this.act === 'heavy') { a = 'atk'; n = 3; fps = 0; }
      else if (this.act === 'block') { a = 'block'; n = 1; fps = 0; }
      else if (this.act === 'roll') { a = 'roll'; n = 2; fps = 10; }
      else { a = this.offering || this.petT > 0 ? 'offer' : this.motion === 'sneak' ? 'sneak' : moving ? 'walk' : 'idle'; n = a === 'idle' || a === 'offer' ? 2 : 4; fps = a === 'walk' ? 9 : a === 'sneak' ? 6 : 2.5; }
      const i = a === 'atk' ? Math.min(2, Math.floor(k / (this.act === 'heavy' ? 0.6 : 0.34) * 3)) : Math.floor(this.t * fps) % n;
      b.set(`${view}_${a}_${i}`, false);
    }
    b.face(cam);
    b.mat.color.copy(tint);
    if (this.iframes > 0 && this.act !== 'roll' && Math.floor(this.iframes * 16) % 2) b.mat.color.setRGB(1.6, 1.6, 1.6);
  }
}

export function turnTo(a: number, b: number, k: number): number {
  let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-k, Math.min(k, d));
}
