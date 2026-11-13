import * as THREE from 'three';
import { audio } from '../src/audio/AudioManager';
import { effectiveTraits, remember, type DragonRecord } from '../src/dragons/DragonRecord';
import { expressPhenotype, generateName } from '../src/dragons/genetics/genome';
import type { DragonGenes, FoodId, Phenotype } from '../src/dragons/genetics/types';
import { DRAGON_FH, DRAGON_FW, DRAGON_OX, DRAGON_OY } from '../src/dragons/rendering/dragonAnims';
import { paintDragonSheet } from '../src/dragons/rendering/DragonPainter';
import { Bond } from '../src/dragons/taming/Bond';
import { Billboard, blobShadow, facesRight, viewFor } from './billboard';
import type { Hero } from './hero3d';
import { turnTo } from './hero3d';
import { pixTexture } from './pixtex';
import { DRG_FEET, DRG_H, DRG_W, paintDragonViews } from './views';
import { SEA, height } from './world';

export type DState = 'graze' | 'wander' | 'flee' | 'approach' | 'eat' | 'bonding' | 'follow' | 'wait' | 'sky' | 'ridden';

/** Growth scale used for 3D adults (the 2D painter's 0.38..1). */
const ADULT = 1;

/** A dragon in the open world: wild life, taming through the shared Bond rules, following, being ridden. */
export class Dragon3D {
  readonly rec: DragonRecord; readonly ph: Phenotype; readonly bond: Bond;
  pos = new THREE.Vector3(); vel = new THREE.Vector3(); heading = 0; state: DState = 'graze';
  air = false; home = new THREE.Vector3(); stateT = 0; emote: string | null = null; emoteT = 0; flash = 0;
  bondHold = 0; roll = 0; pitch = 0; speed = 0;
  readonly side: Billboard; readonly views: Billboard; readonly shadow: THREE.Mesh;
  private t = Math.random() * 10; private target = new THREE.Vector3(); private skyT = 30 + Math.random() * 60; private eatT = 0;

  constructor(scene: THREE.Scene, genes: DragonGenes, x: number, z: number, day: number) {
    this.ph = expressPhenotype(genes);
    this.rec = {
      genes, name: generateName(genes.seed), bornDay: day - 20, hp: this.ph.stats.maxHp, hunger: 0.6, energy: 1, trust: 0, fear: 0, bonded: false, training: 30, observed: 0,
      drift: {}, memories: [], island: 'vigia3d', homeX: x, homeY: z, homeR: 40, x, y: z, follow: false, trapped: false, injured: false, met: false,
    };
    this.bond = new Bond(this.rec, this.ph, () => effectiveTraits(this.ph.personality, this.rec));
    this.pos.set(x, height(x, z), z); this.home.copy(this.pos); this.heading = Math.random() * 6.28;
    const side = paintDragonSheet(this.ph, ADULT), views = paintDragonViews(this.ph, ADULT);
    this.side = new Billboard(pixTexture(side.pix), side.frames, DRAGON_FW, DRAGON_FH, DRAGON_OY, DRAGON_OX);
    this.views = new Billboard(pixTexture(views.pix), views.frames, DRG_W, DRG_H, DRG_FEET, DRG_W / 2);
    this.shadow = blobShadow(3.4 * this.ph.size + 1);
    scene.add(this.side.mesh, this.views.mesh, this.shadow);
  }
  get traits(): ReturnType<typeof effectiveTraits> { return effectiveTraits(this.ph.personality, this.rec); }
  get canFly(): boolean { return this.ph.stats.flySpeed > 0; }
  get rideable(): boolean { return this.ph.rideable; }
  /** Where the hero's hand meets the dragon's mouth. */
  feedSpot(hero: Hero): THREE.Vector3 { const a = Math.atan2(this.pos.x - hero.pos.x, this.pos.z - hero.pos.z); return new THREE.Vector3(hero.pos.x + Math.sin(a) * 2.2, 0, hero.pos.z + Math.cos(a) * 2.2); }
  setState(s: DState): void { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  say(e: string, t = 1.6): void { this.emote = e; this.emoteT = t; }

  /** Wild / bonded behaviour on the ground and in the sky (not while ridden). */
  update(dt: number, hero: Hero, day: number, bestFood: () => FoodId | null, eat: (f: FoodId) => void): void {
    this.t += dt; this.stateT += dt; this.emoteT -= dt; this.flash -= dt; this.bond.tick(dt);
    if (this.state === 'ridden') return;
    const r = this.rec, tr = this.traits, d = Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z), dy = hero.pos.y - this.pos.y;
    const inSight = d < 70 && !hero.mounted;
    // the shared taming rules (distances there are in 2D pixels: 16 px per metre)
    this.bond.presence(dt, d * 16, hero.motion, inSight && !this.air);
    if (!r.bonded && d < 22 && (hero.motion === 'still' || hero.motion === 'sneak') && r.fear < 45 && !this.air) this.bond.observe(dt, day);
    for (const ev of this.bond.drain()) { if (ev.kind === 'bondReady') this.say('heart', 2.5); else if (ev.trust > 0) this.say('heart'); else if (ev.fear > 0) this.say('alert'); }
    let speed = 0;
    if (!r.bonded) {
      if (r.fear > 55 && this.state !== 'flee' && this.state !== 'sky') { this.setState(this.canFly && Math.random() < 0.5 ? 'sky' : 'flee'); this.say('alert'); audio.voice('growl', { pitch: 0.4, rough: 0.5, size: this.ph.size }, 0.5); }
      const food = hero.offering ? bestFood() : null;
      if (this.state !== 'flee' && this.state !== 'sky' && this.state !== 'eat') {
        if (this.bond.canBond() && d < 9) this.setState('bonding');
        else if (food && d < 16 && this.bond.willTake(food, hero.still || hero.offering)) this.setState('approach');
        else if (this.state === 'approach' || this.state === 'bonding') this.setState('graze');
      }
      if ((this.skyT -= dt) <= 0 && this.canFly && (this.state === 'graze' || this.state === 'wander') && d > 30) { this.skyT = 60 + Math.random() * 90; this.setState('sky'); }
      switch (this.state) {
        case 'flee': { const a = Math.atan2(this.pos.x - hero.pos.x, this.pos.z - hero.pos.z); this.target.set(this.pos.x + Math.sin(a) * 20, 0, this.pos.z + Math.cos(a) * 20); speed = 8.5; if (r.fear < 25 || d > 50) this.setState('graze'); break; }
        case 'approach': { const fs = this.feedSpot(hero); this.target.copy(fs); speed = 2.6; if (Math.hypot(fs.x - this.pos.x, fs.z - this.pos.z) < 0.6) { this.heading = Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z); const f = bestFood(); if (f) { eat(f); this.bond.feed(f, day); audio.play('eat', 0.6); this.say('heart'); } this.eatT = 1.3; this.setState('eat'); } break; }
        case 'eat': this.heading = turnTo(this.heading, Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z), dt * 6); if ((this.eatT -= dt) <= 0) this.setState('graze'); break;
        case 'bonding': { const fs = this.feedSpot(hero); if (Math.hypot(fs.x - this.pos.x, fs.z - this.pos.z) > 0.8) { this.target.copy(fs); speed = 2; } this.heading = turnTo(this.heading, Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z), dt * 5); break; }
        case 'wander': speed = 1.6 + tr.curiosity; if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.5 || this.stateT > 12) this.setState('graze'); break;
        case 'graze': if (this.stateT > 4 + (this.rec.genes.seed % 5)) { const a = Math.random() * 6.28, rr = Math.random() * this.rec.homeR; this.target.set(this.home.x + Math.cos(a) * rr, 0, this.home.z + Math.sin(a) * rr); if (height(this.target.x, this.target.z) > SEA + 0.5) this.setState('wander'); else this.stateT = 0; } break;
        case 'sky': break;
        default: this.setState('graze');
      }
    } else {
      // bonded: follow at the hero's side, or wait where told
      if (this.state === 'wait') speed = 0;
      else {
        if (this.state !== 'follow' && this.state !== 'sky') this.setState('follow');
        const side = (this.rec.genes.seed % 2 ? 1 : -1), a = hero.heading + side * 1.9;
        this.target.set(hero.pos.x + Math.sin(a) * 3.2, 0, hero.pos.z + Math.cos(a) * 3.2);
        const td = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
        speed = td > 14 ? 9 : td > 1.2 ? Math.min(6, td * 1.4) : 0;
        if (td > 40 && this.canFly) this.setState('sky');
        if (speed === 0) this.heading = turnTo(this.heading, hero.heading, dt * 3);
        if (hero.mounted) speed = 0;
      }
    }
    if (this.state === 'sky') this.flyAbout(dt, hero);
    else this.walk(dt, speed);
    void dy;
  }

  private walk(dt: number, speed: number): void {
    this.air = false;
    if (speed > 0) {
      const a = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
      this.heading = turnTo(this.heading, a, dt * 4);
      const nx = this.pos.x + Math.sin(this.heading) * speed * dt, nz = this.pos.z + Math.cos(this.heading) * speed * dt;
      if (height(nx, nz) > SEA - 0.3 || this.rec.bonded) { this.pos.x = nx; this.pos.z = nz; } else this.setState('graze');
    }
    this.speed = speed;
    const g = Math.max(height(this.pos.x, this.pos.z), SEA - 0.4);
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 10);
  }

  /** Take off, circle high over the island, then glide back down (wild), or catch up through the air (bonded). */
  private flyAbout(dt: number, hero: Hero): void {
    this.air = true;
    const bonded = this.rec.bonded, t = this.stateT;
    let tx: number, tz: number, ty: number;
    if (bonded) { tx = hero.pos.x - Math.sin(hero.heading) * 4; tz = hero.pos.z - Math.cos(hero.heading) * 4; ty = hero.pos.y + 3; }
    else { const a = t * 0.18 + this.rec.genes.seed; tx = this.home.x + Math.cos(a) * 60; tz = this.home.z + Math.sin(a) * 60; ty = height(this.home.x, this.home.z) + (t < 22 ? 45 : 4); }
    const dx = tx - this.pos.x, dz = tz - this.pos.z, dist = Math.hypot(dx, dz), sp = Math.min(this.ph.stats.flySpeed * 0.12 + 8, dist * 2 + 4);
    this.heading = turnTo(this.heading, Math.atan2(dx, dz), dt * 1.8);
    this.pos.x += Math.sin(this.heading) * sp * dt; this.pos.z += Math.cos(this.heading) * sp * dt;
    this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 0.8);
    this.speed = sp; this.roll += ((turnRate(this.heading, Math.atan2(dx, dz)) * 0.6) - this.roll) * Math.min(1, dt * 3);
    const g = height(this.pos.x, this.pos.z);
    if ((bonded && dist < 6) || (!bonded && t > 26 && this.pos.y - Math.max(g, SEA) < 1.5)) { this.home.set(this.pos.x, 0, this.pos.z); this.setState(bonded ? 'follow' : 'graze'); }
    if (this.pos.y < Math.max(g, SEA) + 0.5) this.pos.y = Math.max(g, SEA) + 0.5;
  }

  /** Pick and place sprites for this frame. */
  render(cam: THREE.Camera, tint: THREE.Color, riderInSide: (x: number, y: number, z: number, visible: boolean) => void): void {
    const p = this.pos, ridden = this.state === 'ridden', fly = this.air || ridden && this.speed > 0.1 && this.air;
    const view = viewFor(this.heading, cam.position, p);
    const sideVisible = view === 'side' || (view === 'front' && fly);
    this.side.mesh.visible = sideVisible; this.views.mesh.visible = !sideVisible;
    this.side.mesh.position.copy(p); this.views.mesh.position.copy(p);
    const flyFrame = Math.floor(this.t * (this.speed > 18 ? 8 : 11)) % 6;
    if (sideVisible) {
      const a = fly ? 'fly' : this.state === 'eat' ? 'eat' : this.state === 'bonding' ? 'nuzzle' : this.speed > 0.3 ? 'walk' : 'idle';
      const n = { fly: 6, eat: 3, nuzzle: 2, walk: 6, idle: 4 }[a], fps = { fly: 11, eat: 6, nuzzle: 3, walk: 10, idle: 5 }[a];
      this.side.set(`${a}_${a === 'fly' ? flyFrame : Math.floor(this.t * fps) % n}`, !facesRight(this.heading, cam));
      this.side.face(cam, fly, fly ? this.roll * 0.5 : 0);
      this.side.mat.color.copy(tint); if (this.flash > 0) this.side.mat.color.setRGB(2, 2, 2);
    } else {
      const v = view === 'back' ? 'back' : 'front';
      const name = fly ? `${ridden ? 'rider' : 'back'}_fly_${flyFrame}` : ridden ? 'rider_idle_0' : `${v}_${this.speed > 0.3 ? 'walk' : 'idle'}_${Math.floor(this.t * (this.speed > 0.3 ? 8 : 2)) % (this.speed > 0.3 ? 4 : 2)}`;
      this.views.set(name, false);
      this.views.face(cam, fly, fly ? -this.roll : 0);
      this.views.mat.color.copy(tint); if (this.flash > 0) this.views.mat.color.setRGB(2, 2, 2);
    }
    // the rider is painted into the back view; in side view a separate sprite sits on the saddle
    riderInSide(p.x, p.y + 1.7 * this.ph.size, p.z, ridden && sideVisible);
    const g = Math.max(height(p.x, p.z), SEA);
    this.shadow.position.set(p.x, g + 0.05, p.z);
    const alt = p.y - g; this.shadow.scale.setScalar(Math.max(0.3, 1 - alt / 40)); (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - alt / 50);
  }
  remember(kind: Parameters<typeof remember>[2], day: number, v: number): void { remember(this.rec, day, kind, v); }
}

function turnRate(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.max(-1, Math.min(1, d)); }
