import * as THREE from 'three';
import { audio } from '../src/audio/AudioManager';
import { GeneticRegistry, createWild, expressPhenotype } from '../src/dragons/genetics/genome';
import type { Element, FoodId, SpeciesId } from '../src/dragons/genetics/types';
import { hashInts } from '../src/utils/rng';
import { Billboard } from './billboard';
import { Dragon3D } from './dragon3d';
import { BURST, EL_COLOR, Fx, Raider3D, Shots, type Target } from './fx3d';
import { Hero, turnTo } from './hero3d';
import { Hud } from './hud3d';
import { input } from './input';
import { MEADOW, PEAK, SEA, buildClouds, buildSea, buildSky, buildTerrain, buildVegetation, forestAt, height, slope } from './world';

const DEBUG = new URLSearchParams(location.search).has('debug');
const SAVE_KEY = 'dragonbound3d.v1';
const FOOD_NAMES: Record<FoodId, string> = { berry: 'frutas', fish: 'peixe', meat: 'carne', herb: 'erva', shroom: 'cogumelo', ember: 'brasa' };

class Game {
  readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly cam: THREE.PerspectiveCamera;
  readonly hero: Hero; readonly dragons: Dragon3D[] = []; readonly fx: Fx; readonly shots: Shots; readonly hud: Hud;
  raiders: Raider3D[] = [];
  private camYaw = 0; private camPitch = 0.28; private camDist = 7.5; private lookIdle = 0; private camPos = new THREE.Vector3();
  private seaTex!: THREE.Texture; private sky!: THREE.Mesh; private clouds: THREE.Sprite[] = [];
  private mount: Dragon3D | null = null; focus: Dragon3D | null = null; private rider!: Billboard;
  private day = 0; private food: Record<FoodId, number> = { berry: 12, fish: 8, meat: 6, herb: 3, shroom: 3, ember: 3 };
  private stamina = 100; private dashT = 0; private dashCd = 0; private lastDash = -9; private slowT = 0; private shake = 0; private hold = 0; private chargeFx: THREE.Sprite | null = null;
  private airTime = 0; private squadCd = 12; private started = false; private saveT = 10; private time = 0; private tint = new THREE.Color(1, 1, 1);
  private flashEl: HTMLElement;

  constructor(readonly canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 9000);
    this.scene.fog = new THREE.Fog(0xbfe4ff, 120, 1300);
    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8aa070, 2.4));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.6); sun.position.set(-300, 500, 200); this.scene.add(sun);
    buildTerrain(this.scene); this.seaTex = buildSea(this.scene); this.sky = buildSky(this.scene); buildVegetation(this.scene); this.clouds = buildClouds(this.scene);
    this.fx = new Fx(this.scene); this.shots = new Shots(this.fx);
    this.hero = new Hero(this.scene);
    this.hero.pos.set(MEADOW.x, height(MEADOW.x, MEADOW.y), MEADOW.y); this.hero.heading = Math.PI * 0.75; this.camYaw = this.hero.heading;
    this.rider = new Billboard(this.hero.bb.tex, (this.hero.bb as unknown as { frames: Record<string, { x: number; y: number; w: number; h: number }> }).frames, 48, 48, 44, 23); this.scene.add(this.rider.mesh);
    this.hud = new Hud(hudRoot);
    this.populate();
    this.load();
    input.attach(canvas, hudRoot);
    this.flashEl = document.createElement('div'); Object.assign(this.flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity .25s' }); document.body.appendChild(this.flashEl);
    addEventListener('resize', () => this.resize()); this.resize();
    if (DEBUG) Object.assign(window, { __g: this });
  }

  /** Wild populations by region: forests, coast, the mountain, the meadow. */
  private populate(): void {
    const reg = new GeneticRegistry(); let n = 0;
    const spawn = (sp: SpeciesId, x: number, z: number, needRide = false): Dragon3D | null => {
      for (let k = 0; k < 200; k++) {
        const g = createWild(sp, hashInts(424242, n * 977 + k), reg), ph = expressPhenotype(g);
        if (needRide && !(ph.rideable && ph.personality.aggression < 0.55)) continue;
        if (height(x, z) < SEA + 1) return null;
        const d = new Dragon3D(this.scene, g, x, z, this.day); this.dragons.push(d); n++; return d;
      }
      return null;
    };
    // the first friend: a coastal marulho grazing at the edge of the meadow
    spawn('marulho', MEADOW.x + 26, MEADOW.y - 14, true);
    spawn('folhasca', MEADOW.x - 30, MEADOW.y - 40); spawn('folhasca', MEADOW.x - 36, MEADOW.y - 34);
    let tries = 0;
    const place = (sp: SpeciesId, want: number, ok: (x: number, z: number, h: number) => boolean, ride = false): void => {
      for (let i = 0; i < want && tries < 20000; tries++) { const x = (Math.random() - 0.5) * 1500, z = (Math.random() - 0.5) * 1500, h = height(x, z); if (h > SEA + 1.5 && slope(x, z) < 0.6 && ok(x, z, h)) { if (spawn(sp, x, z, ride)) i++; } }
    };
    place('folhasca', 6, (x, z) => forestAt(x, z) > 0.5);
    place('marulho', 6, (_x, _z, h) => h < 6, true);
    place('cinzal', 4, (x, z, h) => h > 35 && h < 90 && Math.hypot(x - PEAK.x, z - PEAK.y) < 380, true);
    place('trovisco', 3, (x, z, h) => h > 55 && Math.hypot(x - PEAK.x, z - PEAK.y) < 300, true);
    place('geadino', 3, (_x, _z, h) => h > 100);
    place('pedrusco', 4, (x, z, h) => h > 20 && slope(x, z) > 0.25);
  }

  private resize(): void {
    // render at a low internal resolution and scale up with crisp pixels: 3D that matches the pixel art
    const H = 300, W = Math.round(H * innerWidth / innerHeight);
    this.renderer.setSize(W, H, false); this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
  }

  start(): void { this.started = true; audio.unlock(); audio.setMusic('calm'); this.hud.toast('Um marulho pasta ali perto. Aproxime-se devagar (Shift) e ofereça comida (segure F).'); }

  // ── main loop ───────────────────────────────────────────────────────────
  tick(rdt: number): void {
    if (this.slowT > 0) this.slowT -= rdt;
    const dt = Math.min(rdt, 1 / 12) * (this.slowT > 0 ? 0.3 : 1);
    this.time += dt; this.day += dt / 600;
    input.update();
    const [lx, ly] = input.consumeLook();
    if (this.started) {
      if (this.mount) this.ride(dt, lx, ly); else this.walk(dt, lx, ly);
      for (const d of this.dragons) d.update(dt, this.hero, this.day, () => this.bestFood(d), (f) => { this.food[f]--; });
      this.combat(dt);
      if ((this.saveT -= dt) <= 0) { this.saveT = 15; this.save(); }
    } else { this.camYaw += dt * 0.06; }
    this.camera(dt);
    this.render(dt);
  }

  private bestFood(d: Dragon3D): FoodId | null {
    const fav = d.ph.favoriteFood; if (this.food[fav] > 0) return fav;
    return (Object.keys(this.food) as FoodId[]).find((f) => this.food[f] > 0 && f !== d.ph.dislikedFood) ?? null;
  }

  // ── on foot ─────────────────────────────────────────────────────────────
  private walk(dt: number, lx: number, ly: number): void {
    this.camYaw -= lx; this.camPitch = Math.max(-0.2, Math.min(1.1, this.camPitch + ly));
    const h = this.hero; h.update(dt, this.camYaw);
    // nearest dragon in reach becomes the focus
    let best: Dragon3D | null = null, bd = 14;
    for (const d of this.dragons) { const dist = Math.hypot(d.pos.x - h.pos.x, d.pos.z - h.pos.z); if (dist < bd && !d.air) { bd = dist; best = d; } }
    this.focus = best;
    let prompt: string | null = null;
    if (best) {
      const r = best.rec, near = bd < 4;
      // face to face while interacting
      if (near && (h.offering || h.petT > 0 || best.state === 'bonding' || best.state === 'eat')) h.heading = turnTo(h.heading, Math.atan2(best.pos.x - h.pos.x, best.pos.z - h.pos.z), dt * 10);
      if (!r.bonded) {
        if (best.state === 'bonding') {
          prompt = near ? 'Segure E e fique parado: o vínculo' : 'Ele está pronto. Chegue perto e segure E';
          if (near && input.is('interact') && h.still) { best.bondHold += dt; if (Math.random() < dt * 10) this.fx.puff(best.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x7fe8d0, 1, 1, 0.8, 1); } else best.bondHold = Math.max(0, best.bondHold - dt * 2);
          this.hud.ring(best.bondHold / 2.5);
          if (best.bondHold >= 2.5) this.completeBond(best);
        } else {
          this.hud.ring(0);
          const f = this.bestFood(best);
          prompt = r.fear > 40 ? 'Ele está com medo. Afaste-se ou vá devagar (Shift)' : f ? `Segure F: oferecer ${FOOD_NAMES[f]}` : 'Sem comida';
          if (near && input.pressed('interact')) this.pet(best);
        }
      } else {
        this.hud.ring(0);
        prompt = near ? (best.rideable ? 'E carinho · R montar' : 'E carinho') : null;
        if (near && input.pressed('interact')) this.pet(best);
        if (near && input.pressed('mount') && best.rideable) this.doMount(best);
      }
      this.hud.dragon(r.met || r.bonded ? r.name : '???', r.trust, r.bonded ? '#f2c14e' : '#7fe8d0');
    } else { this.hud.dragon(null); this.hud.ring(0); }
    if (input.pressed('call')) for (const d of this.dragons) if (d.rec.bonded) { d.setState('follow'); audio.play('whistle'); }
    this.hud.prompt(prompt); this.hud.stamina(null); this.hud.crosshair(false);
  }
  private pet(d: Dragon3D): void {
    this.hero.petT = 0.9; this.hero.heading = Math.atan2(d.pos.x - this.hero.pos.x, d.pos.z - this.hero.pos.z);
    const ev = d.bond.pet(this.day);
    if (ev?.kind === 'pet') { d.say('heart'); audio.voice('purr', { pitch: 0.5, rough: 0.2, size: d.ph.size }, 0.6); } else if (ev) { d.say('alert'); d.setState('flee'); }
  }
  private completeBond(d: Dragon3D): void {
    d.bond.completeBond(this.day); d.bondHold = 0; d.setState('follow'); this.hud.ring(0);
    this.fx.play('heal', d.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1.4); this.fx.play('blessing', this.hero.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1);
    this.fx.puff(d.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0x7fe8d0, 30, 6, 1.2, -1);
    audio.play('bond'); audio.voice('roar', { pitch: 0.4, rough: 0.3, size: d.ph.size }, 0.8); this.flash('#a8fff0', 0.35);
    this.hud.toast(`Vínculo formado! ${d.rec.name} agora confia em você.${d.rideable ? ' Chegue perto e aperte R para montar.' : ''}`);
    this.save();
  }

  // ── riding and flight ──────────────────────────────────────────────────
  private doMount(d: Dragon3D): void {
    this.mount = d; d.setState('ridden'); this.hero.mounted = true; d.air = false; d.speed = 0; this.stamina = d.ph.stats.stamina;
    audio.play('flap'); this.hud.toast('Espaço para decolar · R para desmontar no chão');
  }
  private dismount(): void {
    const d = this.mount!; this.mount = null; this.hero.mounted = false; d.setState('follow');
    this.hero.pos.set(d.pos.x + Math.cos(d.heading) * 2, height(d.pos.x, d.pos.z), d.pos.z - Math.sin(d.heading) * 2); this.hero.vel.set(0, 0, 0);
    this.camDist = 7.5; this.cancelCharge();
  }
  private ride(dt: number, lx: number, ly: number): void {
    const d = this.mount!, st = d.ph.stats, maxSt = st.stamina;
    this.dashT -= dt; this.dashCd -= dt;
    if (!d.air) {
      // walking on the ground with the rider: camera-relative like on foot
      this.camYaw -= lx; this.camPitch = Math.max(-0.2, Math.min(1.1, this.camPitch + ly));
      const mag = Math.min(1, Math.hypot(input.mx, input.my));
      if (mag > 0.1) { const a = Math.atan2(input.mx, input.my) + this.camYaw; d.heading = turnTo(d.heading, a, dt * 5); d.speed += (7 * mag - d.speed) * Math.min(1, dt * 4); } else d.speed *= Math.max(0, 1 - dt * 6);
      d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt;
      d.pos.y = Math.max(height(d.pos.x, d.pos.z), SEA - 0.3);
      this.stamina = Math.min(maxSt, this.stamina + 25 * dt);
      if (input.pressed('jump')) { d.air = true; d.pitch = 0.5; d.speed = Math.max(d.speed, 14); d.pos.y += 1; audio.play('flap'); this.fx.puff(d.pos.clone(), 0xd8ccb0, 14, 5, 0.6, -2); }
      if (input.pressed('mount')) { this.dismount(); return; }
      this.hud.prompt(null);
    } else {
      // free flight: steer with mouse / A-D, climb Q or Space, dive C; W faster, S slower; K dash
      this.camYaw -= lx + input.mx * 1.7 * dt;
      const climb = (input.is('up') || input.is('jump') ? 1 : 0) - (input.is('down') ? 1 : 0);
      const wantPitch = Math.max(-0.95, Math.min(0.75, -ly * 6 + climb * 0.6 + (this.lookIdle > 0 ? 0 : 0)));
      d.pitch += (wantPitch * (climb !== 0 || Math.abs(ly) > 0.0001 ? 1 : 0) + (climb === 0 && Math.abs(ly) < 0.0001 ? d.pitch * 0.92 : 0) - d.pitch) * Math.min(1, dt * 3);
      const cruise = 18 + st.flySpeed * 0.08, want = input.my > 0.2 ? cruise * 1.45 : input.my < -0.2 ? cruise * 0.5 : cruise;
      if (input.pressed('dash') && this.dashCd <= 0 && this.stamina > 15) { this.dashT = 0.45; this.dashCd = 0.9; this.stamina -= 15; this.lastDash = this.time; audio.play('dash'); this.fx.puff(d.pos.clone(), 0xffffff, 16, 9, 0.5, 0); }
      const target = this.dashT > 0 ? cruise * 2.4 : want - d.pitch * 10;
      d.speed += (target - d.speed) * Math.min(1, dt * (this.dashT > 0 ? 6 : 1.5));
      const turn = turnDelta(d.heading, this.camYaw);
      d.heading = turnTo(d.heading, this.camYaw, dt * (1.6 + st.agility * 1.2));
      d.roll += (Math.max(-0.9, Math.min(0.9, turn * 2.2)) - d.roll) * Math.min(1, dt * 4);
      d.pos.x += Math.sin(d.heading) * Math.cos(d.pitch) * d.speed * dt; d.pos.z += Math.cos(d.heading) * Math.cos(d.pitch) * d.speed * dt;
      d.pos.y += Math.sin(d.pitch) * d.speed * dt;
      d.pos.y = Math.min(d.pos.y, 420);
      if (d.pitch > 0.1) this.stamina -= 4 * dt; else this.stamina = Math.min(maxSt, this.stamina + 6 * dt);
      if (this.stamina <= 0) d.pitch = Math.min(d.pitch, -0.15);
      // the ground: skim it, or land when slow
      const g = Math.max(height(d.pos.x, d.pos.z), SEA), alt = d.pos.y - g;
      if (alt < 0.6) {
        if (d.speed < 12 || input.my < -0.2) { d.air = false; d.pos.y = g; d.pitch = 0; d.roll = 0; audio.play('land'); this.shake = 0.3; }
        else { d.pos.y = g + 0.6; d.pitch = Math.max(d.pitch, 0.05); }
      }
      if (alt < 4 && d.speed > 16 && Math.random() < dt * 40) this.fx.puff(new THREE.Vector3(d.pos.x - Math.sin(d.heading) * 2, g + 0.2, d.pos.z - Math.cos(d.heading) * 2), g <= SEA + 0.01 ? 0xe8f6ff : 0xcab894, 3, 5, 0.6, -6);
      audio.setWindBoost(Math.min(1.5, d.speed / 30));
      this.airTime += dt;
      this.hud.prompt(null);
    }
    d.flash -= dt;
    this.hud.stamina(this.stamina / maxSt); this.hud.crosshair(d.air); this.hud.dragon(null);
    this.hero.pos.copy(d.pos);
    // attacks from the saddle
    if (input.pressed('melee')) this.wingSlap(d);
    if (input.is('shoot')) { this.hold += dt; if (this.hold > 0.25) this.charge(d); }
    else if (this.hold > 0) { const h = this.hold; this.hold = 0; if (h <= 0.25 || !this.chargeFx) this.shoot(d, 0); else this.shoot(d, Math.min(1, (h - 0.25) / 0.9)); this.cancelCharge(); }
  }
  private mouth(d: Dragon3D): THREE.Vector3 { return d.pos.clone().add(new THREE.Vector3(Math.sin(d.heading) * 2.4, 1.4 * d.ph.size + 0.6, Math.cos(d.heading) * 2.4)); }
  private aimDir(): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  private nearestAhead(from: THREE.Vector3, dir: THREE.Vector3, range: number): Raider3D | null {
    let best: Raider3D | null = null, bs = 0.86;
    for (const r of this.raiders) if (r.alive) { const v = r.pos.clone().sub(from), dist = v.length(); if (dist > range) continue; const c = v.normalize().dot(dir); if (c > bs) { bs = c; best = r; } }
    return best;
  }
  private shoot(d: Dragon3D, charge: number): void {
    const m = this.mouth(d), dir = this.aimDir(), el = d.ph.element;
    this.shots.fire(m, dir, el, Math.max(1, Math.round(d.ph.stats.power / (charge ? 3 : 7))), this.nearestAhead(m, dir, charge ? 140 : 110), charge);
    if (charge) { this.shake = 0.25 + charge * 0.3; d.speed -= 6; }
  }
  private charge(d: Dragon3D): void {
    const m = this.mouth(d), k = Math.min(1, (this.hold - 0.25) / 0.9);
    if (!this.chargeFx) this.chargeFx = this.fx.play('plasma', m, 0.4, { loop: true, tint: EL_COLOR[d.ph.element] });
    if (this.chargeFx) { this.chargeFx.position.copy(m); this.chargeFx.scale.setScalar(2 + k * 4); }
    if (Math.random() < 0.6) this.fx.puff(m.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4)), EL_COLOR[d.ph.element], 1, 1, 0.25, 0);
  }
  private cancelCharge(): void { this.fx.kill(this.chargeFx); this.chargeFx = null; this.hold = 0; }
  private wingSlap(d: Dragon3D): void {
    this.fx.play('spin', d.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 1.6, { tint: EL_COLOR[d.ph.element], add: true });
    audio.play('slash'); audio.play('dash', 0.6);
    let hit = false;
    for (const r of this.raiders) if (r.alive && r.pos.distanceTo(d.pos) < 8) { r.hurt(3, 'physical'); hit = true; }
    if (hit) { this.slowT = Math.max(this.slowT, 0.08); this.shake = 0.3; }
  }

  // ── air battles ────────────────────────────────────────────────────────
  private combat(dt: number): void {
    const m = this.mount;
    if (m?.air && this.airTime > 14 && !this.raiders.some((r) => r.alive) && (this.squadCd -= dt) <= 0) {
      this.squadCd = 30 + Math.random() * 25;
      const fwd = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
      for (let k = 0; k < 3; k++) this.raiders.push(new Raider3D(this.scene, this.fx, this.shots, m.pos.clone().addScaledVector(fwd, 70 + k * 10).add(new THREE.Vector3((k - 1) * 14, 8 + k * 3, 0))));
      this.hud.toast('Caçadores de Escama no céu!'); audio.play('whistle', 0.5); audio.setMusic('tense');
    }
    const pv = m ? new THREE.Vector3(Math.sin(m.heading) * m.speed, 0, Math.cos(m.heading) * m.speed) : new THREE.Vector3();
    const ppos = m ? m.pos : this.hero.pos;
    this.raiders = this.raiders.filter((r) => r.update(dt, ppos.clone().add(new THREE.Vector3(0, 1.5, 0)), pv, this.cam) && r.pos.distanceTo(ppos) < 700);
    if (!this.raiders.some((r) => r.alive)) audio.setMusic('calm');
    this.shots.update(dt, this.raiders as Target[], (p) => this.hitPlayer(p), (p, el, r, dmg) => this.burst(p, el, r, dmg));
  }
  private hitPlayer(p: THREE.Vector3): boolean {
    const at = (this.mount ? this.mount.pos : this.hero.pos).clone().add(new THREE.Vector3(0, 1.4, 0));
    if (p.distanceTo(at) > 2.4) return false;
    if (this.time - this.lastDash < 0.35) { if (this.slowT <= 0) { this.slowT = 0.7; this.flash('#80e8ff', 0.25); audio.play('parry'); this.fx.play('parry', at, 1.4, { add: true }); } return false; }
    if (this.hero.iframes > 0) return true;
    this.hero.hp--; this.hero.iframes = 1.2; if (this.mount) this.mount.flash = 0.15; this.shake = 0.4; audio.play('hurt'); this.flash('#ff6060', 0.2);
    if (this.hero.hp <= 0) { this.hero.hp = this.hero.maxHp; this.hud.toast('Você caiu… e acordou na campina.'); if (this.mount) this.dismount(); this.hero.pos.set(MEADOW.x, height(MEADOW.x, MEADOW.y), MEADOW.y); }
    return true;
  }
  private burst(p: THREE.Vector3, el: Element, r: number, dmg: number): void {
    this.fx.play(BURST[el], p, 2 + r / 6, { add: el === 'fire' || el === 'storm' }); this.fx.play('explosion', p, 1 + r / 10, { add: true });
    this.fx.puff(p, EL_COLOR[el], 30, 10, 0.8, -3); audio.play('crit'); this.shake = 0.6; this.flash('#ffffff', 0.15);
    for (const t of this.raiders) if (t.alive && t.pos.distanceTo(p) < r) t.hurt(dmg, el);
  }
  private flash(color: string, ms: number): void { this.flashEl.style.background = color; this.flashEl.style.transition = 'none'; this.flashEl.style.opacity = '0.35'; requestAnimationFrame(() => { this.flashEl.style.transition = `opacity ${ms}s`; this.flashEl.style.opacity = '0'; }); }

  // ── camera ─────────────────────────────────────────────────────────────
  private camera(dt: number): void {
    const m = this.mount, flying = !!m?.air;
    const focus = (m ? m.pos : this.hero.pos).clone().add(new THREE.Vector3(0, flying ? 2.2 : m ? 2.6 : 1.5, 0));
    const dist = flying ? 8.5 + Math.max(0, (m!.speed - 20) * 0.12) : m ? 8.5 : this.camDist;
    const pitch = flying ? 0.16 - m!.pitch * 0.35 : this.camPitch;
    const want = new THREE.Vector3(focus.x - Math.sin(this.camYaw) * Math.cos(pitch) * dist, focus.y + Math.sin(pitch) * dist, focus.z - Math.cos(this.camYaw) * Math.cos(pitch) * dist);
    const g = Math.max(height(want.x, want.z), SEA) + 0.8; if (want.y < g) want.y = g;
    this.camPos.lerp(want, Math.min(1, dt * (flying ? 6 : 10)));
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want);
    this.cam.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; this.cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)); }
    this.cam.lookAt(focus.x + (flying ? Math.sin(this.camYaw) * 6 : 0), focus.y + (flying ? 1.5 : 0.2), focus.z + (flying ? Math.cos(this.camYaw) * 6 : 0));
    if (flying) this.cam.rotateZ(-m!.roll * 0.12);
    const fov = flying ? 60 + Math.min(18, (m!.speed - 18) * 0.5) : 58; if (Math.abs(this.cam.fov - fov) > 0.1) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3); this.cam.updateProjectionMatrix(); }
  }

  // ── rendering ──────────────────────────────────────────────────────────
  private render(dt: number): void {
    this.fx.update(dt);
    this.seaTex.offset.x = this.time * 0.01; this.seaTex.offset.y = this.time * 0.006;
    this.sky.position.copy(this.cam.position);
    for (const c of this.clouds) { c.position.x += dt * 2; if (c.position.x > 1300) c.position.x = -1300; }
    this.hero.render(this.cam, this.tint);
    for (const d of this.dragons) d.render(this.cam, this.tint, (x, y, z, vis) => {
      if (d !== this.mount) return;
      this.rider.mesh.visible = vis; if (!vis) return;
      this.rider.mesh.position.set(x, y, z); this.rider.set('side_ride_0', this.cam.position.clone().sub(d.pos).cross(new THREE.Vector3(Math.sin(d.heading), 0, Math.cos(d.heading))).y > 0); this.rider.face(this.cam, d.air, d.air ? d.roll * 0.5 : 0);
    });
    if (!this.mount) this.rider.mesh.visible = false;
    this.hud.hearts(this.hero.hp, this.hero.maxHp); this.hud.update(dt);
    this.renderer.render(this.scene, this.cam);
  }

  // ── save ───────────────────────────────────────────────────────────────
  private save(): void {
    try {
      const bonded = this.dragons.filter((d) => d.rec.bonded || d.rec.trust > 5).map((d) => ({ id: d.rec.genes.id, trust: d.rec.trust, bonded: d.rec.bonded, x: d.pos.x, z: d.pos.z, memories: d.rec.memories }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, hero: { x: this.hero.pos.x, z: this.hero.pos.z }, food: this.food, day: this.day, dragons: bonded }));
    } catch { /* private mode */ }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const s = JSON.parse(raw) as { hero: { x: number; z: number }; food: Record<FoodId, number>; day: number; dragons: { id: string; trust: number; bonded: boolean; x: number; z: number; memories: never[] }[] };
      this.hero.pos.set(s.hero.x, height(s.hero.x, s.hero.z), s.hero.z); this.food = { ...this.food, ...s.food }; this.day = s.day ?? 0;
      for (const sd of s.dragons) { const d = this.dragons.find((x) => x.rec.genes.id === sd.id); if (!d) continue; d.rec.trust = sd.trust; d.rec.bonded = sd.bonded; d.rec.memories = sd.memories ?? []; d.rec.met = true; if (sd.bonded) { d.rec.follow = true; d.setState('follow'); d.pos.set(this.hero.pos.x + 3, this.hero.pos.y, this.hero.pos.z + 2); } else d.pos.set(sd.x, height(sd.x, sd.z), sd.z); }
    } catch { /* corrupt save: start fresh */ }
  }
}
function turnDelta(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// ── boot ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game') as HTMLCanvasElement, hudRoot = document.getElementById('hud')!;
const game = new Game(canvas, hudRoot);
game.fx.load().then(() => game.hud.title(() => game.start())).catch(() => game.hud.title(() => game.start()));
let last = performance.now();
const loop = (t: number): void => { game.tick(Math.min(0.1, (t - last) / 1000)); last = t; requestAnimationFrame(loop); };
requestAnimationFrame(loop);
if (DEBUG) Object.assign(window, { __game: game, __input: input });
