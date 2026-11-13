import * as THREE from 'three';
import { Pix } from '../src/art/Pix';
import { paintHeroSheet } from '../src/art/hero';
import { audio } from '../src/audio/AudioManager';
import { Billboard, blobShadow, facesRight, viewFor } from './billboard';
import { input } from './input';
import { pixTexture } from './pixtex';
import { HERO_CELL, HERO_FEET, paintHeroViews, type Frames } from './views';
import { SEA, height } from './world';

export type Motion = 'still' | 'sneak' | 'walk' | 'run';

/** The hero on foot: camera-relative movement, sneaking, jumping, offering food, petting. */
export class Hero {
  pos = new THREE.Vector3(); vel = new THREE.Vector3(); heading = 0; onGround = true;
  motion: Motion = 'still'; offering = false; petT = 0; hp = 6; maxHp = 6; iframes = 0; mounted = false;
  readonly bb: Billboard; readonly shadow: THREE.Mesh;
  private t = 0; private stepT = 0; private stillT = 0;

  constructor(scene: THREE.Scene) {
    // one sheet: the 2D side frames on top, the new front/back views below
    const side = paintHeroSheet(), views = paintHeroViews();
    const pix = new Pix(Math.max(side.pix.w, views.pix.w), side.pix.h + views.pix.h);
    pix.blit(side.pix, 0, 0); pix.blit(views.pix, 0, side.pix.h);
    const frames: Frames = {};
    for (const [k, f] of Object.entries(side.frames)) frames['side_' + k] = f;
    for (const [k, f] of Object.entries(views.frames)) frames[k] = { ...f, y: f.y + side.pix.h };
    this.bb = new Billboard(pixTexture(pix), frames, HERO_CELL, HERO_CELL, HERO_FEET, 23);
    this.shadow = blobShadow(1.1);
    scene.add(this.bb.mesh, this.shadow);
  }
  get still(): boolean { return this.stillT > 0.25; }

  update(dt: number, camYaw: number): void {
    this.t += dt; this.iframes -= dt; this.petT -= dt;
    const mx = input.mx, my = input.my, mag = Math.min(1, Math.hypot(mx, my));
    const sneak = input.is('sneak');
    this.offering = input.is('food') && this.onGround;
    const speed = this.offering ? 0 : sneak ? 2.2 : 5.6;
    if (mag > 0.1 && !this.offering) {
      // camera-relative: forward is where the camera looks
      const a = Math.atan2(mx, my) + camYaw;
      this.heading = turnTo(this.heading, a, dt * 12);
      const tx = Math.sin(a) * speed * mag, tz = Math.cos(a) * speed * mag;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * 10); this.vel.z += (tz - this.vel.z) * Math.min(1, dt * 10);
      this.motion = sneak ? 'sneak' : 'walk'; this.stillT = 0;
    } else { this.vel.x *= Math.max(0, 1 - dt * 12); this.vel.z *= Math.max(0, 1 - dt * 12); this.motion = 'still'; this.stillT += dt; }
    if (input.pressed('jump') && this.onGround && !this.offering) { this.vel.y = 6.2; this.onGround = false; audio.play('jump', 0.6); this.stillT = 0; }
    this.vel.y -= 18 * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // do not walk into deep sea
    if (height(nx, nz) > SEA - 0.6) { this.pos.x = nx; this.pos.z = nz; } else { this.vel.x = this.vel.z = 0; }
    this.pos.y += this.vel.y * dt;
    const g = Math.max(height(this.pos.x, this.pos.z), SEA - 0.5);
    if (this.pos.y <= g) { if (!this.onGround && this.vel.y < -6) audio.play('land', 0.5); this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y > g + 0.3) this.onGround = false;
    if (this.onGround && this.motion !== 'still' && (this.stepT -= dt) <= 0) { this.stepT = this.motion === 'sneak' ? 0.5 : 0.32; audio.play('step', this.motion === 'sneak' ? 0.15 : 0.3); }
  }

  /** Place and animate the sprite for the current camera. */
  render(cam: THREE.Camera, tint: THREE.Color): void {
    const p = this.pos, b = this.bb;
    b.mesh.position.copy(p); b.mesh.visible = !this.mounted;
    this.shadow.position.set(p.x, Math.max(height(p.x, p.z), SEA) + 0.04, p.z); this.shadow.visible = !this.mounted;
    if (this.mounted) return;
    const view = viewFor(this.heading, cam.position, p), moving = this.motion !== 'still';
    let name: string;
    if (view === 'side') {
      const a = this.offering ? 'offer' : this.petT > 0 ? 'pet' : !this.onGround ? (this.vel.y > 0 ? 'jump' : 'fall') : this.motion === 'sneak' ? 'sneak' : moving ? 'run' : 'idle';
      const n = { idle: 6, run: 8, sneak: 6, offer: 2, pet: 4, jump: 2, fall: 2 }[a], fps = a === 'run' ? 14 : a === 'sneak' ? 8 : 6;
      name = `side_${a}_${Math.floor(this.t * fps) % n}`;
      b.set(name, !facesRight(this.heading, cam));
    } else {
      const a = this.offering || this.petT > 0 ? 'offer' : this.motion === 'sneak' ? 'sneak' : moving ? 'walk' : 'idle';
      const n = a === 'idle' || a === 'offer' ? 2 : 4, fps = a === 'walk' ? 9 : a === 'sneak' ? 6 : 2.5;
      name = `${view}_${a}_${Math.floor(this.t * fps) % n}`;
      b.set(name, false);
    }
    b.face(cam);
    b.mat.color.copy(tint);
    if (this.iframes > 0 && Math.floor(this.iframes * 16) % 2) b.mat.color.setRGB(1.6, 1.6, 1.6);
  }
}

export function turnTo(a: number, b: number, k: number): number {
  let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-k, Math.min(k, d));
}
