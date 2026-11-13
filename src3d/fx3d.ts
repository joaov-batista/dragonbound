import * as THREE from 'three';
import { Pix } from '../src/art/Pix';
import { raider } from '../src/art/airforce';
import { audio } from '../src/audio/AudioManager';
import type { Element } from '../src/dragons/genetics/types';
import { Billboard, PPM } from './billboard';
import { pixTexture } from './pixtex';
import { SEA, height } from './world';

interface Meta { fps: number; loop: boolean; frames: number; w: number; h: number; cols: number }
export const EL_COLOR: Record<Element, number> = { fire: 0xff8a30, water: 0x5ac8ff, nature: 0x8fe07a, storm: 0xc8b0ff, earth: 0xd0a868, ice: 0xbff0ff };
const SHOT: Record<Element, string> = { fire: 'fireball', water: 'waterjet', nature: 'leafstorm', storm: 'sparkarc', earth: 'dirt', ice: 'icelance' };
const BURST: Record<Element, string> = { fire: 'explosion', water: 'wavecrash', nature: 'leafstorm', storm: 'thunder', earth: 'earthspike', ice: 'frostnova' };

/** Animated effect sprites (the 2D game's pre-rendered PixelFx sheets), as camera-facing quads. */
export class Fx {
  private manifest: Record<string, Meta> = {}; private tex = new Map<string, THREE.Texture>();
  private live: { s: THREE.Sprite; key: string; t: number; m: Meta; loop: boolean; follow?: THREE.Vector3 }[] = [];
  private dots: { s: THREE.Sprite; v: THREE.Vector3; t: number; life: number; g: number }[] = [];
  private dotMat = new Map<number, THREE.SpriteMaterial>();
  constructor(private scene: THREE.Scene) {}
  async load(): Promise<void> {
    this.manifest = await (await fetch('../vfx/manifest.json')).json();
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.keys(this.manifest).map(async (k) => { const t = await loader.loadAsync(`../vfx/${k}.png`); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; this.tex.set(k, t); }));
  }
  play(key: string, pos: THREE.Vector3, scale = 1, o: { tint?: number; add?: boolean; loop?: boolean; follow?: THREE.Vector3 } = {}): THREE.Sprite | null {
    const m = this.manifest[key], base = this.tex.get(key); if (!m || !base) return null;
    const t = base.clone(); t.needsUpdate = true; t.repeat.set(1 / m.cols, 1 / Math.ceil(m.frames / m.cols));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: o.tint ?? 0xffffff, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, transparent: true, depthWrite: false }));
    s.scale.set((m.w / PPM) * scale, (m.h / PPM) * scale, 1); s.position.copy(pos); s.renderOrder = 5;
    this.scene.add(s); this.live.push({ s, key, t: 0, m, loop: o.loop ?? m.loop, follow: o.follow });
    this.frame(s, m, 0);
    return s;
  }
  private frame(s: THREE.Sprite, m: Meta, f: number): void { const rows = Math.ceil(m.frames / m.cols), t = (s.material as THREE.SpriteMaterial).map!; t.offset.set((f % m.cols) / m.cols, 1 - (Math.floor(f / m.cols) + 1) / rows); }
  kill(s: THREE.Sprite | null): void { if (!s) return; const i = this.live.findIndex((l) => l.s === s); if (i >= 0) { this.scene.remove(s); (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); this.live.splice(i, 1); } }
  /** Small burst of coloured pixels. */
  puff(pos: THREE.Vector3, color: number, n = 8, speed = 4, life = 0.6, gravity = -2): void {
    let mat = this.dotMat.get(color); if (!mat) { mat = new THREE.SpriteMaterial({ color, depthWrite: false }); this.dotMat.set(color, mat); }
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat); s.scale.setScalar(0.16 + Math.random() * 0.12); s.position.copy(pos); this.scene.add(s);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.dots.push({ s, v, t: 0, life: life * (0.5 + Math.random() * 0.5), g: gravity });
    }
  }
  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]; l.t += dt; let f = Math.floor(l.t * l.m.fps);
      if (f >= l.m.frames) { if (l.loop) f %= l.m.frames; else { this.kill(l.s); continue; } }
      this.frame(l.s, l.m, f); if (l.follow) l.s.position.copy(l.follow);
    }
    for (let i = this.dots.length - 1; i >= 0; i--) { const d = this.dots[i]; d.t += dt; d.v.y += d.g * dt; d.s.position.addScaledVector(d.v, dt); if (d.t > d.life) { this.scene.remove(d.s); this.dots.splice(i, 1); } }
  }
}

/** Anything that can be hit by the player's side. */
export interface Target { pos: THREE.Vector3; radius: number; alive: boolean; hurt(dmg: number, el: Element | 'physical'): void }

interface Shot { s: THREE.Sprite | null; pos: THREE.Vector3; vel: THREE.Vector3; t: number; el: Element; dmg: number; friendly: boolean; seek: Target | null; orb: number; trail: number; g?: number; boom?: boolean }
export type HitResult = 'hit' | 'blocked' | 'parried' | 'miss';

/** Dragon shots (homing), power orbs (area burst) and enemy harpoons. */
export class Shots {
  list: Shot[] = [];
  constructor(private fx: Fx) {}
  fire(from: THREE.Vector3, dir: THREE.Vector3, el: Element, dmg: number, seek: Target | null, orb = 0): void {
    const sp = orb ? 42 : 70, s = this.fx.play(orb ? 'plasma' : SHOT[el], from, orb ? 0.6 + orb * 0.6 : 0.7, { loop: true, tint: orb ? EL_COLOR[el] : undefined, add: el === 'fire' || el === 'storm' });
    this.list.push({ s, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(sp), t: orb ? 2.2 : 1.4, el, dmg, friendly: true, seek, orb, trail: 0 });
    audio.play(el === 'fire' ? 'fire' : el === 'water' ? 'water' : el === 'storm' ? 'zap' : el === 'ice' ? 'ice' : el === 'earth' ? 'quake' : 'spore', orb ? 1 : 0.5);
  }
  harpoon(from: THREE.Vector3, to: THREE.Vector3, _origin?: THREE.Vector3): void {
    const s = this.fx.play('icelance', from, 0.5, { loop: true, tint: 0xe8dcc0 });
    this.list.push({ s, pos: from.clone(), vel: to.clone().sub(from).normalize().multiplyScalar(42), t: 2, el: 'ice', dmg: 7, friendly: false, seek: null, orb: 0, trail: 0 });
    audio.play('dash', 0.35);
  }
  /** A cannonball on a ballistic arc that lands at `to` and bursts. */
  cannon(from: THREE.Vector3, to: THREE.Vector3): void {
    const T = 1.6, g = 14, v = to.clone().sub(from).divideScalar(T); v.y += 0.5 * g * T;
    const s = this.fx.play('plasma', from, 0.35, { loop: true, tint: 0x2a2420 });
    this.list.push({ s, pos: from.clone(), vel: v, t: 3, el: 'fire', dmg: 14, friendly: false, seek: null, orb: 0, trail: 0, g, boom: true });
  }
  update(dt: number, targets: Target[], hitPlayer: (p: THREE.Vector3, dmg: number, from: THREE.Vector3) => HitResult, burst: (p: THREE.Vector3, el: Element, r: number, dmg: number) => void): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.t -= dt;
      if (s.seek?.alive) { const want = s.seek.pos.clone().sub(s.pos).normalize().multiplyScalar(s.vel.length()); s.vel.lerp(want, Math.min(1, dt * (s.orb ? 2.5 : 5))); }
      if (s.g) s.vel.y -= s.g * dt;
      s.pos.addScaledVector(s.vel, dt); s.s?.position.copy(s.pos);
      if ((s.trail -= dt) <= 0) { s.trail = s.orb ? 0.02 : 0.04; this.fx.puff(s.pos, s.friendly ? EL_COLOR[s.el] : 0xb0a890, s.orb ? 3 : 1, 1, 0.4, 0); }
      let hit = false;
      if (s.friendly) { for (const t of targets) if (t.alive && t.pos.distanceTo(s.pos) < t.radius + (s.orb ? 1.6 : 0.8)) { if (!s.orb) t.hurt(s.dmg, s.el); hit = true; break; } }
      else {
        const r = hitPlayer(s.pos, s.dmg, s.pos.clone().sub(s.vel));
        if (r === 'parried') { s.friendly = true; s.vel.multiplyScalar(-1.4); s.dmg *= 2; s.t = 1.5; this.fx.play('parry', s.pos, 1, { add: true }); }
        else if (r !== 'miss') hit = true;
      }
      const ground = Math.max(height(s.pos.x, s.pos.z), SEA);
      if (s.pos.y < ground) hit = true;
      if (hit || s.t <= 0) {
        if (s.orb) burst(s.pos, s.el, 6 + s.orb * 6, s.dmg);
        else if (s.boom) { this.fx.play(s.pos.y < SEA + 1 ? 'wavecrash' : 'explosion', s.pos.clone().setY(Math.max(s.pos.y, SEA + 0.5)), 1.2); this.fx.puff(s.pos, 0xffb040, 10, 6, 0.6, -6); audio.play('quake', 0.5); if (!hit) hitPlayer(s.pos, Math.round(s.dmg * 0.6), s.pos); }
        else if (hit) this.fx.play(s.friendly ? (s.el === 'fire' ? 'explosion' : 'hit') : 'hit', s.pos, s.el === 'fire' ? 0.5 : 0.7, { add: s.el === 'fire' });
        this.fx.kill(s.s); this.list.splice(i, 1);
      }
    }
  }
}
export { BURST };

let raiderTex: THREE.Texture | null = null;
/** Scale Hunter on a leather glider: circles the rider, fires harpoons, spirals down in flames when shot. */
export class Raider3D implements Target {
  pos: THREE.Vector3; radius = 1.4; alive = true; hp = 4; private bb: Billboard; private t = Math.random() * 6; private cd = 1.5 + Math.random(); private side = Math.random() < 0.5 ? -1 : 1; private fall = 0; private flash = 0;
  constructor(private scene: THREE.Scene, private fx: Fx, private shots: Shots, at: THREE.Vector3) {
    if (!raiderTex) { const p = new Pix(56 * 3, 40); raider(p, 0, 0, false); raider(p, 56, 1, false); raider(p, 112, 0.4, true); p.outline(0x1a1418); raiderTex = pixTexture(p); }
    this.bb = new Billboard(raiderTex, { g0: { x: 0, y: 0, w: 56, h: 40 }, g1: { x: 56, y: 0, w: 56, h: 40 }, atk: { x: 112, y: 0, w: 56, h: 40 } }, 56, 40, 30, 28, 1.6);
    this.pos = at.clone(); scene.add(this.bb.mesh);
  }
  hurt(dmg: number, el: Element | 'physical'): void {
    if (!this.alive) return; this.hp -= dmg * (el === 'fire' || el === 'storm' ? 2 : 1); this.flash = 0.1;
    this.fx.play('hit', this.pos, 0.8); audio.play('hit', 0.8);
    if (this.hp <= 0) { this.alive = false; this.fall = 0.01; audio.play('crit'); }
  }
  /** Returns false once it should be removed. */
  update(dt: number, player: THREE.Vector3, playerVel: THREE.Vector3, cam: THREE.Camera): boolean {
    this.t += dt; this.flash -= dt;
    if (!this.alive) {
      // spiral down trailing smoke, then blow up
      this.fall += dt; this.pos.y -= (6 + this.fall * 14) * dt; this.pos.x += Math.cos(this.fall * 6) * 6 * dt; this.pos.z += Math.sin(this.fall * 6) * 6 * dt;
      this.fx.puff(this.pos, Math.random() < 0.4 ? 0xff8030 : 0x403834, 2, 1.5, 0.8, 1);
      this.bb.mesh.position.copy(this.pos); this.bb.face(cam, true, this.fall * 8); this.bb.set('g1');
      if (this.pos.y < Math.max(height(this.pos.x, this.pos.z), SEA) + 0.5 || this.fall > 3) { this.fx.play('explosion', this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.1); this.fx.puff(this.pos, 0xffb040, 14, 8, 0.6, -6); audio.play('fire'); this.scene.remove(this.bb.mesh); return false; }
      return true;
    }
    // hold a slot beside/ahead of the rider, weaving
    const fwd = playerVel.clone().setY(0); if (fwd.lengthSq() < 1) fwd.set(0, 0, 1); fwd.normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const want = player.clone().addScaledVector(fwd, 18 + Math.sin(this.t * 0.7) * 8).addScaledVector(right, this.side * (12 + Math.sin(this.t) * 5)).add(new THREE.Vector3(0, 3 + Math.sin(this.t * 1.3) * 4, 0));
    this.pos.lerp(want, Math.min(1, dt * 1.2));
    if ((this.cd -= dt) <= 0 && this.pos.distanceTo(player) < 60) { this.cd = 1.6 + Math.random(); this.shots.harpoon(this.pos.clone(), player.clone().addScaledVector(playerVel, 0.3)); }
    this.bb.mesh.position.copy(this.pos); this.bb.face(cam, true, Math.sin(this.t) * 0.2);
    this.bb.set(this.cd > 1.3 ? 'atk' : Math.sin(this.t * 6) > 0 ? 'g0' : 'g1', this.pos.clone().sub(cam.position).dot(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)) > 0 ? false : true);
    this.bb.mat.color.setScalar(this.flash > 0 ? 2.5 : 1);
    return true;
  }
}
