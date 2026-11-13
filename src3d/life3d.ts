import * as THREE from 'three';
import { Pix, ramp } from '../src/art/Pix';
import type { HeroStyle } from '../src/art/hero';
import { audio } from '../src/audio/AudioManager';
import type { Element } from '../src/dragons/genetics/types';
import { Billboard, blobShadow, facesRight, viewFor } from './billboard';
import { EL_COLOR, type Fx, type Shots, type Target } from './fx3d';
import { personSheet, turnTo } from './hero3d';
import { pixTexture } from './pixtex';
import { HERO_CELL, HERO_FEET, type Gear } from './views';
import { MEADOW, SEA, fbm, forestAt, height, slope } from './world';

// ── where things are ───────────────────────────────────────────────────────
/** Find a coastal spot along a bearing from the island centre (first land of height h0..h1 coming in from the sea). */
export function coastAt(bearing: number, inland = 30): THREE.Vector3 {
  for (let r = 1100; r > 100; r -= 4) { const x = Math.cos(bearing) * r, z = Math.sin(bearing) * r; if (height(x, z) > 1.2) { const xi = Math.cos(bearing) * (r - inland), zi = Math.sin(bearing) * (r - inland); return new THREE.Vector3(xi, height(xi, zi), zi); } }
  return new THREE.Vector3();
}
export const VILLAGE = coastAt(1.35, 40);           // Vigiamar: south coast, a short flight from the meadow
export const DOCK = coastAt(1.35, -10);
export const HOME = new THREE.Vector3(MEADOW.x - 22, 0, MEADOW.y + 14); HOME.y = height(HOME.x, HOME.y);
export const CAMPS = [new THREE.Vector3(-60, 0, -120), new THREE.Vector3(380, 0, 120), new THREE.Vector3(140, 0, -470)].map((v) => { v.y = height(v.x, v.z); return v; });
export const ABYSS = new THREE.Vector3(-1250, 0, -300); // the beast's waters, far west

// ── textures ───────────────────────────────────────────────────────────────
function tex(p: Pix, repeat = false): THREE.Texture { const t = pixTexture(p); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
function planks(base: number): Pix { const p = new Pix(32, 32), r = ramp(base); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.px(x, y, (y % 8 === 0) ? r[0] : ((x + (y >> 3) * 11) % 16 === 0) ? r[1] : r[2 + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0)]); return p; }
function thatch(base: number): Pix { const p = new Pix(32, 32), r = ramp(base); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.px(x, y, y % 6 === 0 ? r[1] : r[(x + y * 2) % 7 === 0 ? 3 : 2]); return p; }
function quad(w: number, h: number, t: THREE.Texture, cross = true): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }));
  if (cross) { const m2 = m.clone(); m2.rotation.y = Math.PI / 2; m.add(m2); }
  return m;
}

/** A little wooden house with a pitched roof (low-poly box + pixel textures). */
function house(scene: THREE.Scene, at: THREE.Vector3, rot: number, w = 6, d = 5, wall = 0x8a6a4a, roof = 0xb8553a): void {
  const g = new THREE.Group(); g.position.copy(at); g.rotation.y = rot;
  const wt = tex(planks(wall), true); wt.repeat.set(w / 2, 1.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new THREE.MeshLambertMaterial({ map: wt })); body.position.y = 1.5; g.add(body);
  const rt = tex(thatch(roof), true); rt.repeat.set(w / 2, 2);
  const rg = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 2.6, 4, 1); rg.rotateY(Math.PI / 4);
  const r = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: rt, flatShading: true })); r.position.y = 4.3; r.scale.set(w / Math.hypot(w, d) * 1.4, 1, d / Math.hypot(w, d) * 1.4); g.add(r);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshLambertMaterial({ color: 0x3a2618 })); door.position.set(0, 0.95, d / 2 + 0.01); g.add(door);
  for (const sx of [-1, 1]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), new THREE.MeshBasicMaterial({ color: 0xffd98a })); win.position.set(sx * w * 0.3, 1.9, d / 2 + 0.01); g.add(win); }
  scene.add(g);
}

// ── people ─────────────────────────────────────────────────────────────────
/** A person in the world (villager or hunter) drawn with the hero rig. */
export class Person {
  pos: THREE.Vector3; heading = Math.random() * 6; speed = 0; readonly bb: Billboard; readonly shadow: THREE.Mesh; t = Math.random() * 10; flash = 0;
  constructor(scene: THREE.Scene, readonly name: string, style: HeroStyle, gear: Gear, at: THREE.Vector3, scale = 1) {
    const s = personSheet(style, gear);
    this.bb = new Billboard(s.tex, s.frames, HERO_CELL, HERO_CELL, HERO_FEET, 23, scale); this.shadow = blobShadow(1.1 * scale);
    this.pos = at.clone(); scene.add(this.bb.mesh, this.shadow);
  }
  render(cam: THREE.Camera, tint: THREE.Color, anim: 'idle' | 'walk' | 'atk' | 'block' | 'hurt' = this.speed > 0.2 ? 'walk' : 'idle', k = 0): void {
    const p = this.pos, b = this.bb; b.mesh.position.copy(p); this.shadow.position.set(p.x, Math.max(height(p.x, p.z), SEA) + 0.04, p.z);
    const view = viewFor(this.heading, cam.position, p);
    if (view === 'side') {
      const n = anim === 'walk' ? `run_${Math.floor(this.t * 12) % 8}` : anim === 'atk' ? `attack1_${Math.min(3, Math.floor(k * 4))}` : anim === 'block' ? 'parry_1' : anim === 'hurt' ? 'hurt_0' : `idle_${Math.floor(this.t * 5) % 6}`;
      b.set('side_' + n, !facesRight(this.heading, cam));
    } else {
      const n = anim === 'walk' ? `walk_${Math.floor(this.t * 9) % 4}` : anim === 'atk' ? `atk_${Math.min(2, Math.floor(k * 3))}` : anim === 'block' ? 'block_0' : `idle_${Math.floor(this.t * 2.5) % 2}`;
      b.set(`${view}_${n}`, false);
    }
    b.face(cam); b.mat.color.copy(tint); if (this.flash > 0) b.mat.color.setRGB(2.2, 2.2, 2.2);
  }
  walkTo(target: THREE.Vector3, dt: number, speed: number): number {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { this.heading = turnTo(this.heading, Math.atan2(dx, dz), dt * 6); const nx = this.pos.x + Math.sin(this.heading) * speed * dt, nz = this.pos.z + Math.cos(this.heading) * speed * dt; if (height(nx, nz) > SEA + 0.2) { this.pos.x = nx; this.pos.z = nz; } this.speed = speed; } else this.speed = 0;
    this.pos.y = Math.max(height(this.pos.x, this.pos.z), SEA); return d;
  }
}

const S = (o: Partial<HeroStyle>): HeroStyle => ({ skin: 0xd9955f, hair: 0x5a3a24, tunic: 0x6a4a3a, pants: 0x5a4a3a, leather: 0x4a3020, scarf: null, band: null, hairStyle: 'tuft', beard: 'none', hat: 'none', ...o });
export interface Villager { p: Person; role: 'chief' | 'smith' | 'market' | 'folk'; home: THREE.Vector3; target: THREE.Vector3; waitT: number; line: string }

/** Vigiamar: houses around a plaza, a pier, fishing boats and villagers with names and jobs. */
export function buildVillage(scene: THREE.Scene): Villager[] {
  const c = VILLAGE, toSea = Math.atan2(DOCK.x - c.x, DOCK.z - c.z);
  for (let i = 0; i < 9; i++) {
    const a = toSea + Math.PI + (i - 4) * 0.42, r = 22 + (i % 3) * 6, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
    if (height(x, z) < 1.5) continue;
    house(scene, new THREE.Vector3(x, height(x, z) - 0.2, z), Math.atan2(c.x - x, c.z - z), 5 + (i % 2) * 2, 4.5, [0x8a6a4a, 0x7a5a3a, 0x9a7a5a][i % 3], [0xb8553a, 0x8a5a3a, 0x6a7a4a][i % 3]);
  }
  // the pier: planks stepping out into the sea
  const pt = tex(planks(0x8a6a4a), true); pt.repeat.set(1, 6);
  const len = 40, pier = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, len), new THREE.MeshLambertMaterial({ map: pt }));
  pier.position.set(DOCK.x + Math.sin(toSea) * len * 0.4, SEA + 0.6, DOCK.z + Math.cos(toSea) * len * 0.4); pier.rotation.y = toSea; scene.add(pier);
  for (let k = 0; k < 6; k++) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), new THREE.MeshLambertMaterial({ color: 0x5a3a24 })); post.position.set(pier.position.x + Math.sin(toSea) * (k * 7 - 17) + Math.cos(toSea) * 1.6, SEA - 0.6, pier.position.z + Math.cos(toSea) * (k * 7 - 17) - Math.sin(toSea) * 1.6); scene.add(post); }
  // campfire in the plaza, banners
  const fireAt = c.clone(); fireAt.y = height(c.x, c.z);
  const people: Villager[] = [];
  const add = (name: string, role: Villager['role'], st: HeroStyle, line: string, off: [number, number]): void => {
    const home = new THREE.Vector3(c.x + off[0], 0, c.z + off[1]); home.y = height(home.x, home.z);
    people.push({ p: new Person(scene, name, st, { sword: 'none', shield: 'none', armor: 'cloth' }, home), role, home, target: home.clone(), waitT: Math.random() * 3, line });
  };
  add('Chefe Ragna', 'chief', S({ hair: 0xd8b060, tunic: 0x7a2a3a, hairStyle: 'braid', scarf: 0xf2c14e, skin: 0xe0b088 }), 'Bem-vindo a Vigiamar. Os Caçadores de Escama rondam a ilha: acampamentos na floresta, navios no mar. E dizem que algo enorme acordou nas águas do oeste.', [4, -3]);
  add('Olvar, o ferreiro', 'smith', S({ hair: 0x2a2020, beard: 'long', tunic: 0x4a4a52, skin: 0xb87a4a, hairStyle: 'bald' }), 'Traga moedas que eu forjo o que você precisar. A Lâmina Flamejante? Só com brasa de verdade.', [-6, 4]);
  add('Sigrun, peixeira', 'market', S({ hair: 0xc04a2a, hairStyle: 'long', tunic: 0x3f6a8a, scarf: 0xffffff }), 'Peixe fresco, frutas e sementes para a sua horta!', [7, 6]);
  const folk = [S({ hair: 0x8a5a30, tunic: 0x4f8a4a }), S({ hair: 0xe8e8e8, beard: 'short', tunic: 0x6a4a9a }), S({ hair: 0x33283f, hairStyle: 'bun', tunic: 0xc8a060 }), S({ hair: 0x5a3a24, tunic: 0x2a3448, hat: 'cap' })];
  const lines = ['Meu avô dizia que um dragão é para a vida toda.', 'Vi um navio de velas vermelhas no horizonte.', 'Dragões não são ferramentas. São vizinhos.', 'À noite, algo preto como breu passa sobre a montanha.'];
  folk.forEach((st, i) => add(['Ivo', 'Lia', 'Bjarni', 'Mira'][i], 'folk', st, lines[i], [(i - 1.5) * 8, -10 + (i % 2) * 18]));
  return people;
}
export function updateVillagers(v: Villager[], dt: number): void {
  for (const n of v) {
    n.p.t += dt;
    if (n.role !== 'folk') { n.p.speed = 0; continue; }
    if (n.waitT > 0) { n.waitT -= dt; n.p.speed = 0; continue; }
    if (n.p.walkTo(n.target, dt, 1.6) < 0.5) { n.waitT = 3 + Math.random() * 5; const a = Math.random() * 6.28; n.target.set(VILLAGE.x + Math.cos(a) * 16, 0, VILLAGE.z + Math.sin(a) * 16); }
  }
}

// ── hunters (on foot) ──────────────────────────────────────────────────────
const HUNTER = S({ skin: 0xc08a5a, hair: 0x2a2020, tunic: 0x5a3a2a, pants: 0x3a3028, leather: 0x2a2020, scarf: 0xb8302a, beard: 'short', hat: 'hood', hatColor: 0x6a2a24 });
/** Scale Hunter on the ground: blade fighters close in with telegraphed swings; crossbowmen keep their distance. */
export class Hunter3D implements Target {
  readonly p: Person; alive = true; hp: number; readonly maxHp: number; posture = 0; stun = 0; radius = 1; private state: 'idle' | 'chase' | 'wind' | 'swing' | 'recover' = 'idle'; private st = 0; private cd = 1 + Math.random(); burn = 0;
  constructor(scene: THREE.Scene, private fx: Fx, private shots: Shots, at: THREE.Vector3, readonly bow: boolean, readonly home: THREE.Vector3) {
    this.p = new Person(scene, 'Caçador', HUNTER, { sword: bow ? 'none' : 'iron', shield: bow ? 'none' : 'wood', armor: 'leather' }, at);
    this.maxHp = this.hp = bow ? 34 : 48;
  }
  get pos(): THREE.Vector3 { return this.p.pos.clone().add(new THREE.Vector3(0, 1, 0)); }
  hurt(dmg: number, el: Element | 'physical', posture = dmg): void {
    if (!this.alive) return;
    const staggered = this.stun > 0, d = dmg * (staggered ? 1.5 : 1);
    this.hp -= d; this.p.flash = 0.1; this.posture += posture;
    if (el === 'fire') this.burn = 3;
    this.fx.play(staggered ? 'crit' : 'hit', this.pos, 0.8); audio.play(staggered ? 'crit' : 'hit');
    if (this.posture >= 50 && this.stun <= 0) { this.stun = 2; this.posture = 0; this.state = 'recover'; this.fx.play('exclaim', this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0.6); }
    if (this.hp <= 0) { this.alive = false; this.fx.play('poof', this.p.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1); this.p.bb.mesh.visible = false; this.p.shadow.visible = false; }
  }
  /** `hitPlayer(dmg, from)` resolves a swing on the hero (block/parry/armour happen there). Returns false when parried. */
  update(dt: number, hero: THREE.Vector3, heroVisible: boolean, hitPlayer: (dmg: number, from: THREE.Vector3) => 'hit' | 'blocked' | 'parried' | 'miss'): void {
    if (!this.alive) return;
    const p = this.p; p.t += dt; p.flash -= dt; this.st += dt; this.cd -= dt;
    if (this.burn > 0) { this.burn -= dt; if (Math.random() < dt * 8) this.fx.puff(this.pos, 0xff8030, 1, 1, 0.5, 2); if (Math.random() < dt) this.hurt(1, 'physical', 0); }
    if (this.stun > 0) { this.stun -= dt; p.speed = 0; this.posture = Math.max(0, this.posture - dt * 10); return; }
    this.posture = Math.max(0, this.posture - dt * 6);
    const d = Math.hypot(hero.x - p.pos.x, hero.z - p.pos.z);
    if (this.state === 'idle') { if (heroVisible && d < 26) this.state = 'chase'; else p.walkTo(this.home, dt, 1.2); return; }
    if (d > 45 || !heroVisible) { this.state = 'idle'; return; }
    p.heading = turnTo(p.heading, Math.atan2(hero.x - p.pos.x, hero.z - p.pos.z), dt * 5);
    if (this.bow) {
      if (d < 9) { const away = p.pos.clone().sub(hero).setY(0).normalize().multiplyScalar(4).add(p.pos); p.walkTo(away, dt, 3); }
      else p.speed = 0;
      if (this.cd <= 0 && d < 30) { this.cd = 3 + Math.random() * 1.5; this.shots.harpoon(this.pos.clone(), hero.clone().add(new THREE.Vector3(0, 1, 0)), this.pos.clone()); }
      return;
    }
    switch (this.state) {
      case 'chase': if (d > 2.2) p.walkTo(hero, dt, 4.2); else { p.speed = 0; if (this.cd <= 0) { this.state = 'wind'; this.st = 0; this.fx.play('exclaim', this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 0.5); } } break;
      case 'wind': p.speed = 0; if (this.st > 0.65) { this.state = 'swing'; this.st = 0; audio.play('slash', 0.7); } break;
      case 'swing': if (this.st > 0.12 && this.st - dt <= 0.12 && d < 2.9) { const r = hitPlayer(9, p.pos); if (r === 'parried') { this.stun = 1.6; this.posture = 0; } } if (this.st > 0.3) { this.state = 'recover'; this.st = 0; this.cd = 0.9 + Math.random() * 0.8; } break;
      case 'recover': if (this.st > 0.5) this.state = 'chase'; break;
    }
  }
  render(cam: THREE.Camera, tint: THREE.Color): void {
    if (!this.alive) return;
    const a = this.stun > 0 ? 'hurt' : this.state === 'wind' ? 'block' : this.state === 'swing' ? 'atk' : undefined;
    this.p.render(cam, tint, a, this.state === 'swing' ? this.st / 0.3 : 0);
    if (this.state === 'wind') this.p.bb.mat.color.setRGB(1.6, 1.2, 1.2);
  }
}

/** Tents, a campfire and hunters; clearing a camp opens its chest. */
export interface Camp { at: THREE.Vector3; hunters: Hunter3D[]; cleared: boolean; loot: string; chest: THREE.Mesh }
export function buildCamps(scene: THREE.Scene, fx: Fx, shots: Shots): Camp[] {
  const tentP = new Pix(48, 36), tr = ramp(0x8a5a3a); tentP.poly([[24, 2], [46, 35], [2, 35]], tr[2]); tentP.poly([[24, 2], [24, 35], [2, 35]], tr[1]); tentP.poly([[24, 14], [30, 35], [18, 35]], 0x1a1010); tentP.line(4, 30, 44, 30, ramp(0xb8302a)[2]); tentP.outline(0x1a1014);
  const tentT = tex(tentP), loots = ['iron', 'leather', 'fire'];
  return CAMPS.map((at, i) => {
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + i, t = quad(4.5, 3.4, tentT); t.position.set(at.x + Math.cos(a) * 7, height(at.x + Math.cos(a) * 7, at.z + Math.sin(a) * 7), at.z + Math.sin(a) * 7); scene.add(t); }
    fx.play('campfire', at.clone().add(new THREE.Vector3(0, 0.8, 0)), 1, { loop: true });
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a5a24 })); chest.position.set(at.x + 2.5, at.y + 0.4, at.z); scene.add(chest);
    const hunters = [0, 1, 2, 3].slice(0, 3 + (i > 0 ? 1 : 0)).map((k) => { const a = k * 1.7 + i; const p = new THREE.Vector3(at.x + Math.cos(a) * 5, 0, at.z + Math.sin(a) * 5); p.y = height(p.x, p.z); return new Hunter3D(scene, fx, shots, p, k === 2, at.clone()); });
    return { at, hunters, cleared: false, loot: loots[i], chest };
  });
}

// ── animals and flowers ────────────────────────────────────────────────────
function paintSheep(f: number): Pix { const p = new Pix(24, 18), w = ramp(0xf0ece0); p.ball(12, 8, 8, 5.5, w); for (const x of [6, 9, 15, 18]) p.rect(x, 12, 1.6, 5 - (f && (x === 9 || x === 18) ? 1 : 0), 0x3a3030); p.ball(20, 6, 3, 2.6, ramp(0x3a3030)); p.px(21, 5, 0xffffff); p.outline(0x1a1418); return p; }
export interface Critter { bb: Billboard; pos: THREE.Vector3; home: THREE.Vector3; heading: number; t: number; target: THREE.Vector3 }
export function buildAnimals(scene: THREE.Scene): Critter[] {
  const sheet = new Pix(48, 18); sheet.blit(paintSheep(0), 0, 0); sheet.blit(paintSheep(1), 24, 0);
  const t = pixTexture(sheet), frames = { s0: { x: 0, y: 0, w: 24, h: 18 }, s1: { x: 24, y: 0, w: 24, h: 18 } }, out: Critter[] = [];
  const flocks = [new THREE.Vector3(MEADOW.x + 40, 0, MEADOW.y + 40), new THREE.Vector3(VILLAGE.x - 40, 0, VILLAGE.z - 30), new THREE.Vector3(-380, 0, -60)];
  for (const f of flocks) for (let k = 0; k < 6; k++) {
    const pos = new THREE.Vector3(f.x + (Math.random() - 0.5) * 20, 0, f.z + (Math.random() - 0.5) * 20); pos.y = height(pos.x, pos.z);
    if (pos.y < 1.5) continue;
    const bb = new Billboard(t, frames, 24, 18, 17, 12); scene.add(bb.mesh, (() => { const s = blobShadow(1); s.position.copy(pos); return s; })());
    out.push({ bb, pos, home: f, heading: Math.random() * 6, t: Math.random() * 9, target: pos.clone() });
  }
  return out;
}
export function updateAnimals(a: Critter[], dt: number, cam: THREE.Camera, hero: THREE.Vector3, tint: THREE.Color): void {
  for (const c of a) {
    c.t += dt;
    const flee = Math.hypot(hero.x - c.pos.x, hero.z - c.pos.z) < 5;
    if (flee) c.target.set(c.pos.x + (c.pos.x - hero.x) * 2, 0, c.pos.z + (c.pos.z - hero.z) * 2);
    else if (Math.random() < dt * 0.15) c.target.set(c.home.x + (Math.random() - 0.5) * 24, 0, c.home.z + (Math.random() - 0.5) * 24);
    const dx = c.target.x - c.pos.x, dz = c.target.z - c.pos.z, d = Math.hypot(dx, dz), sp = flee ? 4 : 1.1;
    if (d > 0.5 && height(c.pos.x + dx / d, c.pos.z + dz / d) > 1) { c.heading = Math.atan2(dx, dz); c.pos.x += (dx / d) * sp * dt; c.pos.z += (dz / d) * sp * dt; }
    c.pos.y = height(c.pos.x, c.pos.z);
    c.bb.mesh.position.copy(c.pos); c.bb.set(d > 0.5 && Math.floor(c.t * 6) % 2 ? 's1' : 's0', !facesRight(c.heading, cam)); c.bb.face(cam); c.bb.mat.color.copy(tint);
  }
}
/** Coloured wildflowers scattered over the meadows and hills. */
export function buildFlowers(scene: THREE.Scene): void {
  const cols = [0xf04a5a, 0xf2c14e, 0xb07af0, 0xffffff, 0x5ab0f0];
  cols.forEach((c, ci) => {
    const p = new Pix(8, 10), cr = ramp(c); p.line(4, 9, 4, 4, 0x3f8a3a); p.ball(4, 3, 2.4, 2.2, cr); p.px(4, 3, 0xffe070); p.outline(0x1f3a1a);
    const geo = new THREE.PlaneGeometry(0.5, 0.62); geo.translate(0, 0.31, 0);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: pixTexture(p), alphaTest: 0.5, side: THREE.DoubleSide }), 1400);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(); let k = 0;
    for (let tries = 0; tries < 20000 && k < 1400; tries++) {
      const x = (Math.random() - 0.5) * 1500, z = (Math.random() - 0.5) * 1500, h = height(x, z);
      if (h < 2 || h > 70 || slope(x, z) > 0.4 || forestAt(x, z) > 0.4) continue;
      if (fbm(x * 0.02 + ci * 7, z * 0.02, 2, 33 + ci) < 0.55) continue; // flowers grow in patches
      v.set(x, h - 0.05, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28); m.compose(v, q, s); inst.setMatrixAt(k++, m);
    }
    inst.count = k; scene.add(inst);
  });
}

// ── the sea: hunter ships, friendly boats, untamable sea serpents, the beast ──
function sailTex(enemy: boolean): THREE.Texture { const p = new Pix(32, 32), r = ramp(enemy ? 0xb8302a : 0xe8dcc0); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.px(x, y, r[(y % 8 === 0) ? 1 : 2]); if (enemy) for (let k = -1; k <= 1; k++) p.line(10 + k * 6, 8, 16 + k * 6, 24, 0x1a1010); else p.rect(0, 14, 32, 3, 0x3f6a8a); return pixTexture(p); }
/** A ship: low-poly hull, mast and a pixel sail. Hunter ships fire cannon arcs at riders who come near. */
export class Ship3D implements Target {
  readonly g = new THREE.Group(); alive = true; hp: number; radius = 6; private cd = 2; private a: number; private sink = 0;
  constructor(scene: THREE.Scene, private fx: Fx, private shots: Shots, readonly enemy: boolean, private orbit: number, phase: number, private cx = 0, private cz = 0, private speed = 0.012) {
    this.hp = enemy ? 70 : 9999; this.a = phase;
    const L = enemy ? 16 : 7, hull = new THREE.Mesh(new THREE.BoxGeometry(L * 0.32, 1.6, L), new THREE.MeshLambertMaterial({ color: enemy ? 0x4a2a1a : 0x8a6a4a, flatShading: true }));
    hull.position.y = 0.4; const bow = new THREE.Mesh(new THREE.ConeGeometry(L * 0.18, L * 0.3, 4), hull.material); bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.4, L * 0.62); this.g.add(hull, bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, L * 0.8), new THREE.MeshLambertMaterial({ color: 0x3a2618 })); mast.position.y = L * 0.4; this.g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.55, L * 0.5), new THREE.MeshLambertMaterial({ map: sailTex(enemy), side: THREE.DoubleSide })); sail.position.set(0, L * 0.5, 0.3); this.g.add(sail);
    scene.add(this.g); this.place();
  }
  get pos(): THREE.Vector3 { return this.g.position.clone().add(new THREE.Vector3(0, 3, 0)); }
  private place(): void { const x = this.cx + Math.cos(this.a) * this.orbit, z = this.cz + Math.sin(this.a) * this.orbit; this.g.position.set(x, SEA + Math.sin(this.a * 40) * 0.15, z); this.g.rotation.y = Math.atan2(-Math.sin(this.a), Math.cos(this.a)) + (this.speed > 0 ? 0 : Math.PI); }
  hurt(dmg: number, el: Element | 'physical'): void {
    if (!this.alive || !this.enemy) return;
    this.hp -= dmg * (el === 'fire' ? 1.6 : 1); this.fx.play('hit', this.pos, 1.2); audio.play('hit', 0.8);
    if (Math.random() < 0.4) this.fx.puff(this.pos, 0x3a3230, 6, 2, 1.2, 1);
    if (this.hp <= 0) { this.alive = false; this.sink = 0.01; audio.play('crit'); for (let k = 0; k < 5; k++) setTimeout(() => this.fx.play('explosion', this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 3, (Math.random() - 0.5) * 8)), 1.4), k * 180); }
  }
  /** Returns false when it has sunk out of sight. */
  update(dt: number, player: THREE.Vector3, playerAir: boolean): boolean {
    if (this.sink > 0) { this.sink += dt; this.g.position.y -= dt * 1.4; this.g.rotation.z += dt * 0.25; if (Math.random() < dt * 10) this.fx.puff(this.pos, 0x403834, 3, 2, 1.2, 1.5); return this.sink < 7; }
    this.a += this.speed * dt * (this.enemy ? 1 : 0.6); this.place();
    if (this.enemy && (this.cd -= dt) <= 0 && this.pos.distanceTo(player) < 200 && (playerAir || player.y < 3)) {
      this.cd = 2.4 + Math.random();
      for (let k = 0; k < 2; k++) setTimeout(() => { if (this.alive) { const from = this.pos.clone(); this.shots.cannon(from, player.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6))); this.fx.puff(from, 0xd8d0c0, 8, 3, 0.8, 1); audio.play('quake', 0.4); } }, k * 300);
    }
    return true;
  }
}

function paintSerpent(head: boolean, col: number): Pix {
  const p = new Pix(48, 48), r = ramp(col);
  if (head) { p.ball(24, 26, 15, 12, r); p.poly([[10, 22], [2, 30], [14, 32]], r[1]); p.ball(16, 22, 3, 3, ramp(0xff3a30)); p.px(15, 21, 0xffffff); for (let k = 0; k < 5; k++) p.poly([[26 + k * 3, 14 - k], [30 + k * 3, 4 - k], [32 + k * 3, 15]], ramp(0xbff0ff)[2]); p.line(4, 34, 22, 36, 0x1a1010); for (let k = 0; k < 4; k++) p.poly([[6 + k * 4, 34], [8 + k * 4, 39], [10 + k * 4, 34]], 0xffffff); }
  else { p.ball(24, 24, 18, 16, r); for (let k = 0; k < 5; k++) p.ellipse(14 + k * 5, 16, 3, 2, r[3]); for (let k = 0; k < 4; k++) p.poly([[16 + k * 6, 10], [19 + k * 6, 1], [22 + k * 6, 10]], ramp(0xbff0ff)[1]); }
  p.outline(0x0a1018); return p;
}
/** A sea serpent arcing out of the water; cannot be tamed and bites riders who fly too low. */
export class SeaSerpent3D implements Target {
  alive = true; hp: number; radius: number; private segs: THREE.Sprite[] = []; private t = Math.random() * 9; private cd = 3; private hurtT = 0;
  constructor(scene: THREE.Scene, private fx: Fx, private shots: Shots, readonly at: THREE.Vector3, readonly size: number, readonly beast = false) {
    this.hp = beast ? 900 : 60; this.radius = beast ? 9 : 3.5;
    const col = beast ? 0x1f3a4a : 0x2a6a7a, head = pixTexture(paintSerpent(true, col)), body = pixTexture(paintSerpent(false, col));
    const n = beast ? 14 : 7;
    for (let k = 0; k < n; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: k === 0 ? head : body, alphaTest: 0.5, transparent: false })); s.scale.setScalar(size * (k === 0 ? 1.2 : 1 - k / (n * 1.8))); scene.add(s); this.segs.push(s); }
  }
  get pos(): THREE.Vector3 { return this.segs[0].position.clone(); }
  hurt(dmg: number, el: Element | 'physical'): void {
    if (!this.alive) return; this.hp -= dmg * (this.beast && el === 'physical' ? 0.5 : 1); this.hurtT = 0.12; this.fx.play('hit', this.pos, this.beast ? 2 : 1); audio.play('hit');
    if (this.hp <= 0) { this.alive = false; for (const s of this.segs) { this.fx.play('wavecrash', s.position, this.size / 3); s.visible = false; } audio.play('crit'); }
  }
  update(dt: number, player: THREE.Vector3, hitPlayer: (dmg: number, from: THREE.Vector3) => void): void {
    if (!this.alive) return;
    this.t += dt; this.cd -= dt; this.hurtT -= dt;
    const d = Math.hypot(player.x - this.at.x, player.z - this.at.z), angry = d < (this.beast ? 160 : 60);
    // body: a travelling sine wave that breaks the surface in arches
    const rise = this.beast ? (angry ? 1 : 0.3) : 1;
    for (let k = 0; k < this.segs.length; k++) {
      const s = this.segs[k], u = this.t * (this.beast ? 0.5 : 0.8) - k * 0.42, R = this.beast ? 40 : 16;
      let x = this.at.x + Math.cos(u) * R, z = this.at.z + Math.sin(u) * R;
      if (angry && k === 0) { const toP = new THREE.Vector3(player.x - x, 0, player.z - z); if (toP.length() > 1) { toP.normalize(); x += toP.x * (this.beast ? 18 : 6); z += toP.z * (this.beast ? 18 : 6); } }
      const y = SEA + Math.sin(this.t * 1.6 - k * 0.9) * this.size * 0.55 * rise + (k === 0 && angry ? this.size * 0.6 : 0);
      s.position.set(x, y, z); s.visible = y > SEA - this.size * 0.4;
      (s.material as THREE.SpriteMaterial).color.setScalar(this.hurtT > 0 ? 2.5 : 1);
      if (Math.random() < dt * 2 && Math.abs(y - SEA) < 1) this.fx.puff(new THREE.Vector3(x, SEA + 0.3, z), 0xe8f6ff, 4, 3, 0.7, -6);
    }
    if (!angry || this.cd > 0) return;
    const head = this.pos, pd = head.distanceTo(player);
    if (this.beast) {
      // the beast: water spouts under the rider and a crushing lunge
      this.cd = 2.6;
      const at = player.clone().setY(SEA);
      this.fx.play('ripples', at, 2.5); audio.play('water', 0.7);
      setTimeout(() => { if (!this.alive) return; this.fx.play('wavecrash', at.clone().add(new THREE.Vector3(0, 2, 0)), 4); this.fx.puff(at, 0xe8f6ff, 30, 12, 1, -8); if (player.distanceTo(at) < 14 && player.y < at.y + 30) hitPlayer(20, at); }, 1100);
      if (pd < 30) { hitPlayer(25, head); this.fx.play('wavecrash', head, 3); }
      if (Math.random() < 0.4) for (let k = 0; k < 3; k++) this.shots.cannon(head.clone().add(new THREE.Vector3(0, 6, 0)), player.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16)));
    } else if (pd < 14) { this.cd = 2.4; hitPlayer(10, head); this.fx.play('wavecrash', head, 1.3); audio.play('water'); }
  }
}

/** Shows how damaged things are, for the HUD. */
export function hpColor(el: Element): string { return '#' + EL_COLOR[el].toString(16).padStart(6, '0'); }
