import * as THREE from 'three';
import { HERO_STYLE, type HeroStyle } from '../src/art/hero';
import { Pix } from '../src/art/Pix';
import { audio } from '../src/audio/AudioManager';
import { GeneticRegistry, createWild, expressPhenotype } from '../src/dragons/genetics/genome';
import type { Element, FoodId, SpeciesId } from '../src/dragons/genetics/types';
import { hashInts } from '../src/utils/rng';
import { Billboard } from './billboard';
import { Dragon3D } from './dragon3d';
import { BURST, EL_COLOR, Fx, Raider3D, Shots, type HitResult, type Target } from './fx3d';
import { ARMORS, Hero, SHIELDS, SWORDS, turnTo } from './hero3d';
import { Hud } from './hud3d';
import { input } from './input';
import { ABYSS, DOCK, HOME, VILLAGE, Ship3D, coastAt, SeaSerpent3D, buildAnimals, buildCamps, buildFlowers, buildVillage, updateAnimals, updateVillagers, type Camp, type Critter, type Villager } from './life3d';
import { pixTexture } from './pixtex';
import { paintHeroViews, type Gear } from './views';
import { MEADOW, PEAK, SEA, buildClouds, buildSea, buildSky, buildTerrain, buildVegetation, forestAt, height, slope } from './world';

const DEBUG = new URLSearchParams(location.search).has('debug');
const SAVE_KEY = 'dragonbound3d.v2';
const FOOD_NAMES: Record<FoodId, string> = { berry: 'frutas', fish: 'peixe', meat: 'carne', herb: 'erva', shroom: 'cogumelo', ember: 'brasa' };
const DAY_LEN = 900; // seconds per in-game day

interface Step { text: string; sub?: () => string; target: () => THREE.Vector3 | null; done: () => boolean; hint?: string }
interface Plot { mesh: THREE.Mesh; crop: THREE.Mesh | null; state: 'empty' | 'growing' | 'ready'; water: number; lastWater: number }

class Game {
  readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly cam: THREE.PerspectiveCamera;
  readonly hero: Hero; readonly dragons: Dragon3D[] = []; readonly fx: Fx; readonly shots: Shots; readonly hud: Hud;
  raiders: Raider3D[] = []; villagers: Villager[] = []; camps: Camp[] = []; animals: Critter[] = []; ships: Ship3D[] = []; serpents: SeaSerpent3D[] = []; beast!: SeaSerpent3D;
  private camYaw = 0; private camPitch = 0.28; private camDist = 7.5; private camPos = new THREE.Vector3();
  private seaTex!: THREE.Texture; private sky!: THREE.Mesh; private clouds: THREE.Sprite[] = []; private sun!: THREE.DirectionalLight; private hemi!: THREE.HemisphereLight;
  mount: Dragon3D | null = null; focus: Dragon3D | null = null; private rider!: Billboard; private lock: Target | null = null;
  clock = 0.3; dayN = 1; coins = 30; food: Record<FoodId, number> = { berry: 12, fish: 8, meat: 6, herb: 3, shroom: 3, ember: 3 }; seeds = 4;
  owned: { sword: Gear['sword'][]; shield: Gear['shield'][]; armor: Gear['armor'][] } = { sword: ['wood'], shield: ['none'], armor: ['cloth'] };
  style: HeroStyle = { ...HERO_STYLE }; gear: Gear = { sword: 'wood', shield: 'none', armor: 'cloth' };
  private stamina = 100; private dashT = 0; private dashCd = 0; private lastDash = -9; private slowT = 0; private shake = 0; private hold = 0; private chargeFx: THREE.Sprite | null = null;
  private airTime = 0; private squadCd = 20; started = false; private saveT = 10; time = 0; private tint = new THREE.Color(1, 1, 1);
  private flashEl: HTMLElement; private swingHits = new Map<Target, number>(); private helpT = 0; private plots: Plot[] = [];
  flags: Record<string, number> = {}; deadIds: string[] = []; step = 0; private steps: Step[] = []; private stepShown = -1; breu!: Dragon3D;

  constructor(readonly canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 9000);
    this.scene.fog = new THREE.Fog(0xbfe4ff, 120, 1300);
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8aa070, 2.4); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.6); this.sun.position.set(-300, 500, 200); this.scene.add(this.sun);
    buildTerrain(this.scene); this.seaTex = buildSea(this.scene); this.sky = buildSky(this.scene); buildVegetation(this.scene); this.clouds = buildClouds(this.scene); buildFlowers(this.scene);
    this.fx = new Fx(this.scene); this.shots = new Shots(this.fx);
    this.hero = new Hero(this.scene);
    this.hero.pos.set(MEADOW.x, height(MEADOW.x, MEADOW.y), MEADOW.y); this.hero.heading = Math.PI * 0.75; this.camYaw = this.hero.heading;
    this.hud = new Hud(hudRoot);
    this.load();
    this.hero.setLook(this.style, this.gear);
    this.rider = new Billboard(this.hero.sheet.tex, this.hero.sheet.frames, 48, 48, 44, 23); this.scene.add(this.rider.mesh);
    this.populate(); this.applyDragonSave();
    this.villagers = buildVillage(this.scene); this.animals = buildAnimals(this.scene);
    this.buildHome();
    this.sea();
    this.quests();
    input.attach(canvas, hudRoot);
    this.flashEl = document.createElement('div'); Object.assign(this.flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity .25s' }); document.body.appendChild(this.flashEl);
    addEventListener('resize', () => this.resize()); this.resize();
    if (DEBUG) Object.assign(window, { __g: this });
  }
  afterFx(): void { this.camps = buildCamps(this.scene, this.fx, this.shots); for (const c of this.camps) if (this.flags['camp' + this.camps.indexOf(c)]) { c.cleared = true; for (const h of c.hunters) { h.alive = false; h.p.bb.mesh.visible = false; h.p.shadow.visible = false; } } }

  /** Wild populations by region: forests, coast, the mountain, the meadow, and the rare night dragon. */
  private populate(): void {
    const reg = new GeneticRegistry(); let n = 0;
    const spawn = (sp: SpeciesId, x: number, z: number, needRide = false): Dragon3D | null => {
      for (let k = 0; k < 200; k++) {
        const g = createWild(sp, hashInts(424242, n * 977 + k), reg), ph = expressPhenotype(g);
        if (needRide && !(ph.rideable && ph.personality.aggression < 0.55)) continue;
        if (height(x, z) < SEA + 1) return null;
        const d = new Dragon3D(this.scene, g, x, z, 0, this.style); this.dragons.push(d); n++; return d;
      }
      return null;
    };
    spawn('marulho', MEADOW.x + 26, MEADOW.y - 14, true);
    spawn('folhasca', MEADOW.x - 30, MEADOW.y - 40); spawn('folhasca', MEADOW.x - 36, MEADOW.y - 34);
    let tries = 0; let seed = 77;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const place = (sp: SpeciesId, want: number, ok: (x: number, z: number, h: number) => boolean, ride = false): void => {
      for (let i = 0; i < want && tries < 20000; tries++) { const x = (rnd() - 0.5) * 1500, z = (rnd() - 0.5) * 1500, h = height(x, z); if (h > SEA + 1.5 && slope(x, z) < 0.6 && ok(x, z, h)) { if (spawn(sp, x, z, ride)) i++; } }
    };
    place('folhasca', 6, (x, z) => forestAt(x, z) > 0.5);
    place('marulho', 6, (_x, _z, h) => h < 6, true);
    place('cinzal', 4, (x, z, h) => h > 35 && h < 90 && Math.hypot(x - PEAK.x, z - PEAK.y) < 380, true);
    place('trovisco', 3, (x, z, h) => h > 55 && Math.hypot(x - PEAK.x, z - PEAK.y) < 300, true);
    place('geadino', 3, (_x, _z, h) => h > 100);
    place('pedrusco', 4, (x, z, h) => h > 20 && slope(x, z) > 0.25);
    // Breu: one, on the shoulder of the mountain, only after dark
    const bx = PEAK.x - 40, bz = PEAK.y + 50;
    this.breu = spawn('breu', bx, bz, true)!; this.breu.nocturnal = true; this.breu.rec.homeR = 25;
  }

  private buildHome(): void {
    // your house on the meadow, and six plots of tilled soil beside it
    const g = new THREE.Group(); g.position.copy(HOME);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), new THREE.MeshLambertMaterial({ color: 0x9a7a5a })); wall.position.y = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 4), new THREE.MeshLambertMaterial({ color: 0x6a7a4a, flatShading: true })); roof.position.y = 4.3; roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 1, 1);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshLambertMaterial({ color: 0x3a2618 })); door.position.set(0, 0.95, 2.51);
    g.add(wall, roof, door); this.scene.add(g);
    const soil = new Pix(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) soil.px(x, y, y % 4 === 0 ? 0x4a3020 : (x * 7 + y * 3) % 5 === 0 ? 0x6a4a30 : 0x5a3a24);
    const st = pixTexture(soil);
    for (let i = 0; i < 6; i++) {
      const x = HOME.x + 7 + (i % 3) * 2.6, z = HOME.z - 2 + Math.floor(i / 3) * 2.6, m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshLambertMaterial({ map: st }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, height(x, z) + 0.06, z); this.scene.add(m);
      this.plots.push({ mesh: m, crop: null, state: 'empty', water: 0, lastWater: -1 });
    }
  }
  private sea(): void {
    for (let k = 0; k < 3; k++) this.ships.push(new Ship3D(this.scene, this.fx, this.shots, true, 990 + k * 40, k * 2.1, 0, 0, 0.012 + k * 0.002));
    const off = DOCK.clone().sub(VILLAGE).setY(0).normalize().multiplyScalar(70).add(DOCK);
    for (let k = 0; k < 3; k++) this.ships.push(new Ship3D(this.scene, this.fx, this.shots, false, 18 + k * 8, k * 2, off.x, off.z, 0.05));
    for (let k = 0; k < 4; k++) { const a = 0.6 + k * 1.5, r = 1080; this.serpents.push(new SeaSerpent3D(this.scene, this.fx, this.shots, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), 6)); }
    this.beast = new SeaSerpent3D(this.scene, this.fx, this.shots, ABYSS, 26, true);
    if (this.flags.beast) { this.beast.alive = false; }
  }

  // ── quests: the tutorial and the story, one short objective at a time ──
  private quests(): void {
    const first = this.dragons[0], dist = (p: THREE.Vector3): number => Math.hypot(p.x - this.hero.pos.x, p.z - this.hero.pos.z);
    const ragna = this.villagers.find((v) => v.role === 'chief')!;
    this.steps = [
      { text: 'Encontre o marulho na campina', target: () => first.pos, done: () => dist(first.pos) < 16 || first.rec.bonded, hint: 'Siga o ◆ na bússola, no alto da tela.' },
      { text: 'Chegue perto devagar', sub: () => 'Segure Shift para andar sem assustá-lo', target: () => first.pos, done: () => (dist(first.pos) < 7 && first.rec.fear < 40) || first.rec.bonded },
      { text: 'Ofereça comida', sub: () => 'Segure F parado: ele vem comer da sua mão', target: () => first.pos, done: () => first.rec.memories.some((m) => m.kind === 'fed') || first.rec.bonded },
      { text: 'Ganhe a confiança dele', sub: () => `Carinho (E) e mais comida · confiança ${Math.round(first.rec.trust)}%`, target: () => first.pos, done: () => first.state === 'bonding' || first.rec.bonded },
      { text: 'Crie o vínculo', sub: () => 'Segure E, parado, de frente para ele', target: () => first.pos, done: () => first.rec.bonded },
      { text: 'Monte no seu dragão', sub: () => 'Chegue perto e aperte R', target: () => first.pos, done: () => !!this.mount || !!this.flags.flew },
      { text: 'Voe até Vigiamar', sub: () => 'Espaço decola · mouse/A-D vira · Q sobe · C desce', target: () => VILLAGE, done: () => dist(VILLAGE) < 50, hint: 'No ar: W acelera, K dá o dash, clique atira.' },
      { text: 'Fale com a Chefe Ragna', sub: () => 'Pouse, chegue perto dela e aperte E', target: () => ragna.p.pos, done: () => !!this.flags.ragna },
      { text: 'Derrote o acampamento dos Caçadores', sub: () => 'Clique ataca · segure para golpe forte · botão direito defende · K rola', target: () => this.camps[0]?.at ?? null, done: () => !!this.flags.loot0, hint: 'Defender no instante do golpe é uma defesa perfeita: atordoa e devolve flechas.' },
      { text: 'Volte para casa e plante', sub: () => `E na horta ao lado da casa · sementes: ${this.seeds}`, target: () => HOME, done: () => this.plots.some((p) => p.state !== 'empty') },
      { text: 'Afunde um navio dos Caçadores', sub: () => 'Velas vermelhas no mar aberto', target: () => this.ships.filter((s) => s.enemy && s.alive).sort((a, b) => dist(a.pos) - dist(b.pos))[0]?.pos ?? null, done: () => (this.flags.sunk ?? 0) > 0 },
      { text: 'Enfrente a Fera do Abismo', sub: () => 'Águas do extremo oeste: siga o ◆', target: () => ABYSS, done: () => !this.beast.alive },
      { text: 'Encontre o dragão negro', sub: () => 'Dizem que ele voa à noite perto do pico', target: () => (this.isNight ? this.breu.pos : PEAK.x !== 0 ? new THREE.Vector3(PEAK.x, height(PEAK.x, PEAK.y), PEAK.y) : null), done: () => this.breu.rec.bonded },
    ];
  }
  private questTick(): void {
    while (this.step < this.steps.length && this.steps[this.step].done()) { this.step++; if (this.step < this.steps.length) audio.play('pickup', 0.7); }
    const s = this.steps[this.step];
    if (!s) { this.hud.objective('Explore o mundo', 'Cuide dos seus dragões, da horta e da vila'); this.hud.marker(this.cam, null, 0); this.hud.compass(this.camYaw, null); return; }
    if (this.stepShown !== this.step) { this.stepShown = this.step; if (s.hint) this.hud.toast(s.hint); }
    this.hud.objective(s.text, s.sub?.() ?? '');
    const t = s.target();
    if (t) { const d = Math.hypot(t.x - this.hero.pos.x, t.z - this.hero.pos.z); this.hud.compass(this.camYaw, { bearing: Math.atan2(t.x - this.hero.pos.x, t.z - this.hero.pos.z) }); this.hud.marker(this.cam, t.clone().add(new THREE.Vector3(0, 4, 0)), d); }
    else { this.hud.compass(this.camYaw, null); this.hud.marker(this.cam, null, 0); }
  }
  questLog(): void {
    const rows = this.steps.map((s, i) => `<div class="row ${i < this.step ? 'done' : ''}"><span>${i === this.step ? '◆ ' : ''}${s.text}</span><span>${i < this.step ? '✓' : ''}</span></div>`).join('');
    this.hud.open(`<h3>Missões · dia ${this.dayN}</h3>${rows}<p style="margin:10px 0 0;color:#9aa4c4">M fecha</p>`);
  }

  private resize(): void { const H = 300, W = Math.round(H * innerWidth / innerHeight); this.renderer.setSize(W, H, false); this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); }
  start(): void {
    this.started = true; audio.unlock(); audio.setMusic('calm');
    try { if (matchMedia('(pointer: coarse)').matches) void document.documentElement.requestFullscreen?.(); } catch { /* not allowed */ }
  }
  openCreator(after?: () => void): void {
    this.hud.creator(this.style, (st, c) => {
      const v = paintHeroViews(st, this.gear), f = v.frames.front_idle_0, x = c.getContext('2d')!, img = x.createImageData(48, 48);
      for (let y = 0; y < 48; y++) for (let k = 0; k < 48; k++) { const si = ((f.y + y) * v.pix.w + f.x + k) * 4, di = (y * 48 + k) * 4; for (let j = 0; j < 4; j++) img.data[di + j] = v.pix.data[si + j]; }
      x.putImageData(img, 0, 0);
    }, (st) => { this.style = st; this.relook(); this.save(); after?.(); });
  }
  private relook(): void {
    this.hero.setLook(this.style, this.gear);
    this.scene.remove(this.rider.mesh); this.rider = new Billboard(this.hero.sheet.tex, this.hero.sheet.frames, 48, 48, 44, 23); this.scene.add(this.rider.mesh);
    for (const d of this.dragons) if (d.rec.bonded) d.repaintRider(this.style);
  }

  // ── main loop ───────────────────────────────────────────────────────────
  get isNight(): boolean { return this.clock < 0.22 || this.clock > 0.8; }
  tick(rdt: number): void {
    if (this.slowT > 0) this.slowT -= rdt;
    const dt = Math.min(rdt, 1 / 12) * (this.slowT > 0 ? 0.3 : 1);
    this.time += dt;
    input.update();
    const [lx, ly] = input.consumeLook();
    if (input.pressed('map')) { if (this.hud.menuOpen) this.hud.close(); else this.questLog(); }
    if (input.pressed('bag')) { if (this.hud.menuOpen) this.hud.close(); else this.bag(); }
    if (this.started && !this.hud.menuOpen) {
      this.clock += dt / DAY_LEN; if (this.clock >= 1) { this.clock -= 1; this.dayN++; this.newDay(); }
      if (this.mount) this.ride(dt, lx, ly); else this.walk(dt, lx, ly);
      const day = this.dayN + this.clock;
      for (const d of this.dragons) { if (d.nocturnal && !d.rec.bonded) d.hidden = !this.isNight; d.update(dt, this.hero, day, () => this.bestFood(d), (f) => { this.food[f]--; }); }
      this.combat(dt);
      updateVillagers(this.villagers, dt); updateAnimals(this.animals, dt, this.cam, this.hero.pos, this.tint);
      this.questTick();
      if ((this.saveT -= dt) <= 0) { this.saveT = 15; this.save(); }
    } else if (!this.started) this.camYaw += dt * 0.06;
    this.daylight();
    this.camera(dt);
    this.render(dt);
  }
  private bestFood(d: Dragon3D): FoodId | null {
    const fav = d.ph.favoriteFood; if (this.food[fav] > 0) return fav;
    return (Object.keys(this.food) as FoodId[]).find((f) => this.food[f] > 0 && f !== d.ph.dislikedFood) ?? null;
  }
  /** Sun, sky, fog and sprite tint follow the time of day. */
  private daylight(): void {
    const a = (this.clock - 0.25) * Math.PI * 2, sunY = Math.sin(a), light = Math.max(0, Math.min(1, sunY * 2.2 + 0.35));
    const dusk = Math.max(0, 1 - Math.abs(sunY) * 3.5) * (light > 0.05 ? 1 : 0.4);
    this.sun.position.set(Math.cos(a) * 500, Math.max(60, sunY * 500), 200); this.sun.intensity = 0.4 + light * 2.4;
    this.hemi.intensity = 0.7 + light * 1.8;
    const day = new THREE.Color(0xbfe4ff), night = new THREE.Color(0x1a2248), duskC = new THREE.Color(0xf0a070);
    const fog = night.clone().lerp(day, light).lerp(duskC, dusk * 0.5);
    (this.scene.fog as THREE.Fog).color.copy(fog);
    (this.sky.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0.18, 0.22, 0.42).lerp(new THREE.Color(1, 1, 1), light).lerp(duskC, dusk * 0.35));
    this.tint.setRGB(0.42, 0.46, 0.7).lerp(new THREE.Color(1, 1, 1), light).lerp(new THREE.Color(1, 0.82, 0.7), dusk * 0.4);
    audio.update(0, light);
  }
  private newDay(): void {
    for (const p of this.plots) { if (p.state === 'growing' && p.lastWater >= this.dayN - 1) { p.water++; if (p.water >= 2) { p.state = 'ready'; this.cropMesh(p, true); } } }
    this.hud.toast(`Dia ${this.dayN}`);
  }

  // ── on foot ─────────────────────────────────────────────────────────────
  private foes(): Target[] { const out: Target[] = []; for (const c of this.camps) for (const h of c.hunters) if (h.alive) out.push(h); return out; }
  private walk(dt: number, lx: number, ly: number): void {
    const h = this.hero;
    if (input.pressed('lock')) { if (this.lock) this.lock = null; else { let best: Target | null = null, bd = 22; for (const f of this.foes()) { const d = f.pos.distanceTo(h.pos); if (d < bd) { bd = d; best = f; } } this.lock = best; } }
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(h.pos) > 30)) this.lock = null;
    if (this.lock) { const want = Math.atan2(this.lock.pos.x - h.pos.x, this.lock.pos.z - h.pos.z); this.camYaw = turnTo(this.camYaw, want, dt * 4); }
    else this.camYaw -= lx;
    this.camPitch = Math.max(-0.2, Math.min(1.1, this.camPitch + ly));
    h.update(dt, this.camYaw, this.lock?.pos ?? null);
    this.melee();
    // nearest dragon becomes the focus
    let best: Dragon3D | null = null, bd = 14;
    for (const d of this.dragons) { if (d.dead || d.hidden) continue; const dist = Math.hypot(d.pos.x - h.pos.x, d.pos.z - h.pos.z); if (dist < bd && !d.air) { bd = dist; best = d; } }
    this.focus = best;
    let prompt: string | null = null;
    if (best) {
      const r = best.rec, near = bd < 4;
      if (near && (h.offering || h.petT > 0 || best.state === 'bonding' || best.state === 'eat')) h.heading = turnTo(h.heading, Math.atan2(best.pos.x - h.pos.x, best.pos.z - h.pos.z), dt * 10);
      if (best.state === 'down') prompt = `${r.name} está desmaiado e se recupera`;
      else if (!r.bonded) {
        if (best.state === 'bonding') {
          prompt = near ? 'Segure E, parado: o vínculo' : 'Ele está pronto. Chegue perto e segure E';
          if (near && input.is('interact') && h.still) { best.bondHold += dt; if (Math.random() < dt * 10) this.fx.puff(best.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x7fe8d0, 1, 1, 0.8, 1); } else best.bondHold = Math.max(0, best.bondHold - dt * 2);
          this.hud.ring(best.bondHold / 2.5);
          if (best.bondHold >= 2.5) this.completeBond(best);
        } else {
          this.hud.ring(0); const f = this.bestFood(best);
          prompt = r.fear > 40 ? 'Com medo: afaste-se ou ande devagar (Shift)' : f ? `Segure F: oferecer ${FOOD_NAMES[f]}${near ? ' · E carinho' : ''}` : 'Sem comida';
          if (near && input.pressed('interact')) this.pet(best);
        }
      } else {
        this.hud.ring(0);
        prompt = near ? (best.rideable ? 'E carinho · R montar' : 'E carinho') : null;
        if (near && input.pressed('interact')) this.pet(best);
        if (near && input.pressed('mount') && best.rideable) this.doMount(best);
      }
      this.hud.dragon(r.met || r.bonded ? r.name : '???', r.bonded ? best.rec.hp / best.ph.stats.maxHp : r.trust / 100, r.bonded ? '#f2c14e' : '#7fe8d0', r.bonded ? best.lives : -1);
    } else { this.hud.dragon(null); this.hud.ring(0); }
    // villagers, chests, home, farm
    const near = (p: THREE.Vector3, r: number): boolean => Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < r;
    const v = this.villagers.map((x) => ({ x, d: Math.hypot(x.p.pos.x - h.pos.x, x.p.pos.z - h.pos.z) })).filter((o) => o.d < 3).sort((a, b2) => a.d - b2.d)[0]?.x;
    if (v) {
      v.p.heading = Math.atan2(h.pos.x - v.p.pos.x, h.pos.z - v.p.pos.z);
      prompt = `E falar com ${v.p.name}`;
      if (input.pressed('interact')) this.talk(v);
    }
    this.camps.forEach((c, i) => { if (c.cleared && !this.flags['loot' + i] && near(c.chest.position, 3)) { prompt = 'E abrir o baú'; if (input.pressed('interact')) this.openChest(i); } });
    if (near(HOME, 5)) { prompt = this.isNight ? 'E dormir até de manhã' : 'E descansar (dormir)'; if (input.pressed('interact')) this.sleep(); }
    for (const p of this.plots) if (near(p.mesh.position, 1.6)) {
      prompt = p.state === 'empty' ? (this.seeds > 0 ? `E plantar (${this.seeds} sementes)` : 'Compre sementes no mercado') : p.state === 'ready' ? 'E colher' : p.lastWater >= this.dayN ? 'Regado hoje: volte amanhã' : 'E regar';
      if (input.pressed('interact')) this.farm(p);
    }
    if (input.pressed('call')) for (const d of this.dragons) if (d.rec.bonded && d.state !== 'down') { d.setState('follow'); audio.play('whistle'); }
    this.hud.prompt(prompt); this.hud.crosshair(false);
    this.hud.bars(h.hp / h.maxHp, h.stamina / h.staminaMax, null);
  }
  /** Sword hits during the swing window: each swing hits each foe once; fire blade burns. */
  private melee(): void {
    const h = this.hero; if (!h.hitWindow) return;
    const w = SWORDS[h.gear.sword], heavy = h.act === 'heavy', reach = w.reach * (heavy ? 1.3 : 1);
    const dmg = w.atk * (heavy ? 2.4 : h.combo === 2 ? 1.5 : 1), el: Element | 'physical' = h.gear.sword === 'fire' ? 'fire' : 'physical';
    const tip = h.pos.clone().add(new THREE.Vector3(Math.sin(h.heading) * reach * 0.7, 1, Math.cos(h.heading) * reach * 0.7));
    if (h.gear.sword === 'fire' && Math.random() < 0.6) this.fx.puff(tip, 0xff8030, 3, 2, 0.4, 2);
    if (h.actT < 0.1) this.fx.play(heavy ? 'cleave' : 'slash', tip, heavy ? 1.2 : 0.8, { tint: el === 'fire' ? 0xffa040 : undefined });
    for (const f of this.foes()) {
      if (this.swingHits.get(f) === h.swingId) continue;
      const v = f.pos.clone().sub(h.pos).setY(0), d = v.length(); if (d > reach + f.radius) continue;
      const ang = Math.abs(angDiff(h.heading, Math.atan2(v.x, v.z))); if (ang > (heavy ? 1.6 : 1.1)) continue;
      this.swingHits.set(f, h.swingId);
      (f as unknown as { hurt(d: number, e: Element | 'physical', p: number): void }).hurt(dmg, el, heavy ? 40 : 14);
      this.shake = heavy ? 0.35 : 0.15; this.slowT = Math.max(this.slowT, heavy ? 0.08 : 0.04);
      if (!f.alive) { this.coins += 6; this.hud.toast('+6 moedas'); }
    }
  }
  private pet(d: Dragon3D): void {
    this.hero.petT = 0.9; this.hero.heading = Math.atan2(d.pos.x - this.hero.pos.x, d.pos.z - this.hero.pos.z);
    const ev = d.bond.pet(this.dayN + this.clock);
    if (ev?.kind === 'pet') { d.say('heart'); audio.voice('purr', { pitch: 0.5, rough: 0.2, size: d.ph.size }, 0.6); this.fx.puff(d.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xff7a9a, 4, 1.5, 0.8, 1); } else if (ev) { d.say('alert'); d.setState('flee'); }
  }
  private completeBond(d: Dragon3D): void {
    d.bond.completeBond(this.dayN + this.clock); d.bondHold = 0; d.setState('follow'); this.hud.ring(0); d.repaintRider(this.style);
    this.fx.play('heal', d.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1.4); this.fx.play('blessing', this.hero.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1);
    this.fx.puff(d.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0x7fe8d0, 30, 6, 1.2, -1);
    audio.play('bond'); audio.voice('roar', { pitch: 0.4, rough: 0.3, size: d.ph.size }, 0.8); this.flash('#a8fff0', 0.35);
    this.hud.toast(`Vínculo formado com ${d.rec.name}!`);
    this.save();
  }
  private talk(v: Villager): void {
    if (v.role === 'chief' && !this.flags.ragna) { this.flags.ragna = 1; this.coins += 20; }
    const shop = v.role === 'smith' ? this.smithRows() : v.role === 'market' ? this.marketRows() : '';
    const f = this.hud.open(`<h3>${v.p.name}</h3><p style="margin:0 0 10px">${v.line}</p>${shop}<p style="margin:10px 0 0;color:#9aa4c4">Moedas: ${this.coins}</p>`);
    f.querySelectorAll('button[data-buy]').forEach((b) => (b as HTMLElement).onclick = () => { this.buy((b as HTMLElement).dataset.buy!); this.talk(v); });
  }
  private smithRows(): string {
    const items: [string, string, number][] = [['sword:iron', SWORDS.iron.name, 60], ['shield:wood', SHIELDS.wood.name, 30], ['shield:iron', SHIELDS.iron.name, 90], ['armor:leather', ARMORS.leather.name, 40], ['armor:iron', ARMORS.iron.name, 120]];
    return items.map(([id, n, c]) => { const [slot, kind] = id.split(':'), have = (this.owned as Record<string, string[]>)[slot].includes(kind); return `<div class="row"><span>${n}</span>${have ? '<span>✓</span>' : `<button data-buy="${id}:${c}">${c} moedas</button>`}</div>`; }).join('');
  }
  private marketRows(): string {
    return ([['food:fish', 'Peixe', 3], ['food:berry', 'Frutas', 2], ['food:meat', 'Carne', 4], ['seeds', 'Sementes de frutas (x3)', 6]] as [string, string, number][]).map(([id, n, c]) => `<div class="row"><span>${n}</span><button data-buy="${id}:${c}">${c} moedas</button></div>`).join('');
  }
  private buy(spec: string): void {
    const parts = spec.split(':'), cost = Number(parts.at(-1)); if (this.coins < cost) { this.hud.toast('Moedas insuficientes'); return; }
    this.coins -= cost; audio.play('pickup');
    if (parts[0] === 'food') this.food[parts[1] as FoodId] += 3;
    else if (parts[0] === 'seeds') this.seeds += 3;
    else { (this.owned as Record<string, string[]>)[parts[0]].push(parts[1]); (this.gear as unknown as Record<string, string>)[parts[0]] = parts[1]; this.relook(); }
    this.save();
  }
  bag(): void {
    const slot = (key: 'sword' | 'shield' | 'armor', names: Record<string, { name: string }>): string => `<div class="row"><span>${{ sword: 'Espada', shield: 'Escudo', armor: 'Armadura' }[key]}</span><span>${this.owned[key].map((k) => `<button class="${this.gear[key] === k ? 'on' : ''}" data-eq="${key}:${k}">${names[k].name}</button>`).join(' ')}</span></div>`;
    const bonded = this.dragons.filter((d) => d.rec.bonded && !d.dead).map((d) => `<div class="row"><span>${d.rec.name}</span><span>${'♥'.repeat(d.lives)}${'♡'.repeat(3 - d.lives)} ${d.state === 'down' ? 'desmaiado' : ''}</span></div>`).join('') || '<div class="row"><span>Nenhum ainda</span></div>';
    const food = (Object.keys(this.food) as FoodId[]).map((k) => `${FOOD_NAMES[k]} ${this.food[k]}`).join(' · ');
    const f = this.hud.open(`<h3>Bolsa</h3>${slot('sword', SWORDS)}${slot('shield', SHIELDS)}${slot('armor', ARMORS)}<p>${food} · sementes ${this.seeds} · ${this.coins} moedas</p><h3 style="font-size:22px">Seus dragões</h3>${bonded}<p style="margin:10px 0 0"><button class="cr">Mudar aparência</button></p>`);
    f.querySelectorAll('button[data-eq]').forEach((b) => (b as HTMLElement).onclick = () => { const [k, v] = (b as HTMLElement).dataset.eq!.split(':'); (this.gear as unknown as Record<string, string>)[k] = v; this.relook(); this.bag(); });
    (f.querySelector('.cr') as HTMLElement).onclick = () => this.openCreator();
  }
  private openChest(i: number): void {
    this.flags['loot' + i] = 1; const loot = this.camps[i].loot; this.coins += 25;
    const give = (slot: 'sword' | 'shield' | 'armor', k: string, name: string): void => { if (!(this.owned[slot] as string[]).includes(k)) (this.owned[slot] as string[]).push(k); (this.gear as unknown as Record<string, string>)[slot] = k; this.relook(); this.hud.toast(`Baú: ${name} e 25 moedas!`); };
    if (loot === 'iron') give('shield', 'wood', SHIELDS.wood.name); else if (loot === 'leather') give('armor', 'leather', ARMORS.leather.name); else give('sword', 'fire', SWORDS.fire.name);
    this.fx.play('collect', this.camps[i].chest.position, 1.2); audio.play('chest'); this.save();
  }
  private sleep(): void {
    this.flash('#0c0e1a', 1.2); if (this.clock > 0.27) this.dayN++; this.clock = 0.27; this.newDay();
    this.hero.hp = this.hero.maxHp; for (const d of this.dragons) if (d.rec.bonded) { d.rec.hp = d.ph.stats.maxHp; if (d.state === 'down') { d.downT = 0; } }
    this.save(); this.hud.toast(`Bom dia! Dia ${this.dayN}`);
  }
  private cropMesh(p: Plot, ripe: boolean): void {
    if (p.crop) this.scene.remove(p.crop);
    const c = new Pix(16, 16); c.line(8, 15, 8, 6, 0x3f8a3a); c.ellipse(5, 9, 3, 2, 0x5ab04a); c.ellipse(11, 7, 3, 2, 0x5ab04a);
    if (ripe) for (const [x, y] of [[4, 5], [12, 4], [8, 3]]) c.ellipse(x, y, 1.8, 1.8, 0xd83a5a);
    c.outline(0x1f3a1a);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshLambertMaterial({ map: pixTexture(c), alphaTest: 0.5, side: THREE.DoubleSide }));
    m.geometry.translate(0, 0.6, 0); m.position.copy(p.mesh.position); const m2 = m.clone(); m2.rotation.y = Math.PI / 2; m.add(m2);
    this.scene.add(m); p.crop = m;
  }
  private farm(p: Plot): void {
    if (p.state === 'empty' && this.seeds > 0) { this.seeds--; p.state = 'growing'; p.water = 0; p.lastWater = this.dayN; this.cropMesh(p, false); audio.play('step'); this.hud.toast('Plantado e regado. Regue todo dia: em 2 dias dá frutas.'); }
    else if (p.state === 'growing' && p.lastWater < this.dayN) { p.lastWater = this.dayN; this.fx.puff(p.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x7ac8ff, 8, 2, 0.6, -4); audio.play('splash', 0.5); }
    else if (p.state === 'ready') { p.state = 'empty'; this.food.berry += 4; if (Math.random() < 0.5) this.seeds++; if (p.crop) this.scene.remove(p.crop); p.crop = null; audio.play('pickup'); this.hud.toast('+4 frutas'); }
  }

  // ── riding and flight ──────────────────────────────────────────────────
  private doMount(d: Dragon3D): void {
    if (d.state === 'down') return;
    this.mount = d; d.setState('ridden'); this.hero.mounted = true; d.air = false; d.speed = 0; this.stamina = d.ph.stats.stamina; this.flags.flew = 1;
    audio.play('flap');
  }
  private dismount(): void {
    const d = this.mount!; this.mount = null; this.hero.mounted = false; if (d.state === 'ridden') d.setState('follow'); d.air = false; d.pos.y = Math.max(height(d.pos.x, d.pos.z), SEA - 0.3);
    this.hero.pos.set(d.pos.x + Math.cos(d.heading) * 2, height(d.pos.x, d.pos.z), d.pos.z - Math.sin(d.heading) * 2); this.hero.vel.set(0, 0, 0);
    this.camDist = 7.5; this.cancelCharge();
  }
  private ride(dt: number, lx: number, ly: number): void {
    const d = this.mount!, st = d.ph.stats, maxSt = st.stamina;
    this.dashT -= dt; this.dashCd -= dt;
    if (!d.air) {
      this.camYaw -= lx; this.camPitch = Math.max(-0.2, Math.min(1.1, this.camPitch + ly));
      const mag = Math.min(1, Math.hypot(input.mx, input.my));
      if (mag > 0.1) { const a = Math.atan2(-input.mx, input.my) + this.camYaw; d.heading = turnTo(d.heading, a, dt * 5); d.speed += (8 * mag - d.speed) * Math.min(1, dt * 4); } else d.speed *= Math.max(0, 1 - dt * 6);
      d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt;
      d.pos.y = Math.max(height(d.pos.x, d.pos.z), SEA - 0.3);
      this.stamina = Math.min(maxSt, this.stamina + 25 * dt);
      if (input.pressed('jump')) { d.air = true; d.pitch = 0.5; d.speed = Math.max(d.speed, 14); d.pos.y += 1; audio.play('flap'); this.fx.puff(d.pos.clone(), 0xd8ccb0, 14, 5, 0.6, -2); }
      if (input.pressed('mount')) { this.dismount(); return; }
      this.hud.prompt('Espaço decolar · R descer');
    } else {
      this.camYaw -= lx + input.mx * 1.7 * dt;
      const climb = (input.is('up') || input.is('jump') ? 1 : 0) - (input.is('down') ? 1 : 0);
      const steer = climb !== 0 || Math.abs(ly) > 0.0001;
      const wantPitch = Math.max(-0.95, Math.min(0.75, -ly * 6 + climb * 0.6));
      d.pitch += ((steer ? wantPitch : d.pitch * 0.92) - d.pitch) * Math.min(1, dt * 3);
      const cruise = 18 + st.flySpeed * 0.08, want = input.my > 0.2 ? cruise * 1.45 : input.my < -0.2 ? cruise * 0.5 : cruise;
      // a long, strong dash
      if (input.pressed('dash') && this.dashCd <= 0 && this.stamina > 18) { this.dashT = 0.95; this.dashCd = 1.3; this.stamina -= 18; this.lastDash = this.time; audio.play('dash'); this.fx.puff(d.pos.clone(), 0xffffff, 24, 10, 0.6, 0); this.shake = 0.2; }
      if (this.dashT > 0 && Math.random() < 0.7) this.fx.puff(d.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3)), 0xffffff, 1, 0.5, 0.35, 0);
      const target = this.dashT > 0 ? cruise * 2.8 : want - d.pitch * 10;
      d.speed += (target - d.speed) * Math.min(1, dt * (this.dashT > 0 ? 6 : 1.5));
      const turn = angDiff(d.heading, this.camYaw);
      d.heading = turnTo(d.heading, this.camYaw, dt * (1.6 + st.agility * 1.2));
      d.roll += (Math.max(-0.9, Math.min(0.9, turn * 2.2)) - d.roll) * Math.min(1, dt * 4);
      d.pos.x += Math.sin(d.heading) * Math.cos(d.pitch) * d.speed * dt; d.pos.z += Math.cos(d.heading) * Math.cos(d.pitch) * d.speed * dt;
      d.pos.y += Math.sin(d.pitch) * d.speed * dt; d.pos.y = Math.min(d.pos.y, 420);
      if (d.pitch > 0.1) this.stamina -= 4 * dt; else this.stamina = Math.min(maxSt, this.stamina + 6 * dt);
      if (this.stamina <= 0) d.pitch = Math.min(d.pitch, -0.15);
      const g = Math.max(height(d.pos.x, d.pos.z), SEA), alt = d.pos.y - g;
      if (alt < 0.6) {
        if (d.speed < 12 || input.my < -0.2) { d.air = false; d.pos.y = g; d.pitch = 0; d.roll = 0; audio.play('land'); this.shake = 0.3; }
        else { d.pos.y = g + 0.6; d.pitch = Math.max(d.pitch, 0.05); }
      }
      if (alt < 4 && d.speed > 16 && Math.random() < dt * 40) this.fx.puff(new THREE.Vector3(d.pos.x - Math.sin(d.heading) * 2, g + 0.2, d.pos.z - Math.cos(d.heading) * 2), g <= SEA + 0.01 ? 0xe8f6ff : 0xcab894, 3, 5, 0.6, -6);
      audio.setWindBoost(Math.min(1.5, d.speed / 30));
      this.airTime += dt; this.hud.prompt(null);
    }
    d.flash -= dt;
    this.hud.bars(this.hero.hp / this.hero.maxHp, this.stamina / maxSt, d.rec.hp / d.ph.stats.maxHp); this.hud.crosshair(d.air);
    this.hud.dragon(d.rec.name, d.rec.hp / d.ph.stats.maxHp, '#f2c14e', d.lives);
    this.hero.pos.copy(d.pos);
    if (input.pressed('melee')) this.wingSlap(d);
    if (input.is('shoot')) { this.hold += dt; if (this.hold > 0.25) this.charge(d); }
    else if (this.hold > 0) { const h = this.hold; this.hold = 0; if (h <= 0.25 || !this.chargeFx) this.shoot(d, 0); else this.shoot(d, Math.min(1, (h - 0.25) / 0.9)); this.cancelCharge(); }
  }
  private mouth(d: Dragon3D): THREE.Vector3 { return d.pos.clone().add(new THREE.Vector3(Math.sin(d.heading) * 2.4, 1.4 * d.ph.size + 0.6, Math.cos(d.heading) * 2.4)); }
  private aimDir(): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  private targets(): Target[] { return [...this.raiders, ...this.foes(), ...this.ships.filter((s) => s.enemy), ...this.serpents, this.beast].filter((t) => t.alive); }
  private nearestAhead(from: THREE.Vector3, dir: THREE.Vector3, range: number): Target | null {
    let best: Target | null = null, bs = 0.86;
    for (const r of this.targets()) { const v = r.pos.clone().sub(from), dist = v.length(); if (dist > range) continue; const c = v.normalize().dot(dir); if (c > bs) { bs = c; best = r; } }
    return best;
  }
  private shoot(d: Dragon3D, charge: number): void {
    const m = this.mouth(d), dir = this.aimDir(), el = d.ph.element;
    this.shots.fire(m, dir, el, Math.max(4, Math.round(d.ph.stats.power / (charge ? 1.2 : 2.5))), this.nearestAhead(m, dir, charge ? 160 : 120), charge);
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
    for (const r of this.targets()) if (r.pos.distanceTo(d.pos) < 8 + r.radius) { r.hurt(10, 'physical'); hit = true; }
    if (hit) { this.slowT = Math.max(this.slowT, 0.08); this.shake = 0.3; }
  }

  // ── battles ────────────────────────────────────────────────────────────
  private combat(dt: number): void {
    const m = this.mount;
    if (m?.air && this.airTime > 14 && !this.raiders.some((r) => r.alive) && (this.squadCd -= dt) <= 0) {
      this.squadCd = 35 + Math.random() * 30;
      const fwd = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
      for (let k = 0; k < 3; k++) this.raiders.push(new Raider3D(this.scene, this.fx, this.shots, m.pos.clone().addScaledVector(fwd, 70 + k * 10).add(new THREE.Vector3((k - 1) * 14, 8 + k * 3, 0))));
      this.hud.toast('Caçadores de Escama no céu!'); audio.play('whistle', 0.5);
    }
    const ppos = m ? m.pos : this.hero.pos, pv = m ? new THREE.Vector3(Math.sin(m.heading) * m.speed, 0, Math.cos(m.heading) * m.speed) : new THREE.Vector3();
    this.raiders = this.raiders.filter((r) => { const keep = r.update(dt, ppos.clone().add(new THREE.Vector3(0, 1.5, 0)), pv, this.cam) && r.pos.distanceTo(ppos) < 700; if (!keep && !r.alive) { this.coins += 6; } return keep; });
    const hit = (dmg: number, from: THREE.Vector3): HitResult => this.resolveHit(dmg, from);
    for (const c of this.camps) { for (const h of c.hunters) h.update(dt, this.hero.pos, !this.hero.mounted, hit); if (!c.cleared && c.hunters.every((h) => !h.alive)) { c.cleared = true; this.flags['camp' + this.camps.indexOf(c)] = 1; this.hud.toast('Acampamento derrotado! Abra o baú.'); } }
    this.ships = this.ships.filter((s) => { const was = s.alive; const keep = s.update(dt, ppos, !!m?.air); if (was && !s.alive) { this.flags.sunk = (this.flags.sunk ?? 0) + 1; this.coins += 40; this.hud.toast('Navio afundado! +40 moedas'); } return keep; });
    for (const s of this.serpents) s.update(dt, ppos.clone().add(new THREE.Vector3(0, 1, 0)), (d, f) => this.resolveHit(d, f));
    const bAlive = this.beast.alive; this.beast.update(dt, ppos.clone().add(new THREE.Vector3(0, 1, 0)), (d, f) => this.resolveHit(d, f));
    if (bAlive && !this.beast.alive) { this.flags.beast = 1; this.coins += 200; (['shield', 'armor'] as const).forEach((k) => { if (!(this.owned[k] as string[]).includes('scale')) (this.owned[k] as string[]).push('scale'); }); this.hud.toast('A Fera do Abismo caiu! Escudo e armadura de escamas na bolsa.'); this.flash('#ffffff', 0.6); }
    if (Math.hypot(ppos.x - ABYSS.x, ppos.z - ABYSS.z) < 200 && this.beast.alive) { this.hud.dragon('Fera do Abismo', this.beast.hp / 900, '#ff5a5a'); }
    // bonded dragons fight beside you: they shoot at hunters close by
    if ((this.helpT -= dt) <= 0) {
      this.helpT = 1.4;
      for (const d of this.dragons) if (d.rec.bonded && d !== m && d.state === 'follow' && !d.dead) {
        const t = this.foes().find((f) => f.pos.distanceTo(d.pos) < 22); if (!t) continue;
        const from = this.mouth(d); this.shots.fire(from, t.pos.clone().sub(from), d.ph.element, Math.round(d.ph.stats.power / 3), t);
      }
    }
    const fighting = this.raiders.some((r) => r.alive) || this.foes().some((f) => f.pos.distanceTo(this.hero.pos) < 30);
    audio.setMusic(fighting ? 'tense' : this.isNight ? 'storm' : 'calm');
    this.shots.update(dt, this.targets(), (p, dmg, from) => (p.distanceTo(ppos.clone().add(new THREE.Vector3(0, 1.4, 0))) < 2.6 ? this.resolveHit(dmg, from) : 'miss'), (p, el, r, dmg) => this.burst(p, el, r, dmg));
  }
  /** Every hit on the player goes through here: mount health and knockouts, dodges, blocks, perfect blocks, armour. */
  private resolveHit(dmg: number, from: THREE.Vector3): HitResult {
    const h = this.hero, m = this.mount, at = (m ? m.pos : h.pos).clone().add(new THREE.Vector3(0, 1.4, 0));
    if (m) {
      if (this.time - this.lastDash < 0.4) { if (this.slowT <= 0) { this.slowT = 0.7; this.flash('#80e8ff', 0.25); audio.play('parry'); this.fx.play('parry', at, 1.4, { add: true }); } return 'miss'; }
      if (h.iframes > 0) return 'hit';
      m.rec.hp -= dmg * (1 - Math.min(0.4, m.ph.stats.maxHp / 400)); m.flash = 0.15; h.iframes = 0.8; this.shake = 0.4; audio.play('hurt'); this.flash('#ff6060', 0.2);
      if (m.rec.hp <= 0) this.knockout(m);
      return 'hit';
    }
    if (h.rolling || h.iframes > 0.4) return 'miss';
    const facing = Math.abs(angDiff(h.heading, Math.atan2(from.x - h.pos.x, from.z - h.pos.z))) < 1.7;
    if (h.blocking && facing) {
      if (h.parrying) { this.slowT = 0.35; this.flash('#ffffff', 0.15); audio.play('parry'); this.fx.play('parry', at, 1.2, { add: true }); h.stamina = Math.min(h.staminaMax, h.stamina + 10); return 'parried'; }
      const sh = SHIELDS[h.gear.shield]; h.hp -= dmg * sh.block; h.stamina -= 12; audio.play('parry', 0.6); this.fx.play('block', at, 0.9); this.shake = 0.15;
      if (h.stamina <= 0) { h.act = 'hurt'; h.actT = 0; this.hud.toast('Defesa quebrada!'); }
      this.afterHeroHit(); return 'blocked';
    }
    h.hp -= dmg * (1 - ARMORS[h.gear.armor].def); h.iframes = 0.6; h.flinch(); this.shake = 0.35; audio.play('hurt'); this.flash('#ff6060', 0.18);
    this.afterHeroHit(); return 'hit';
  }
  private afterHeroHit(): void {
    if (this.hero.hp > 0) return;
    this.hero.hp = this.hero.maxHp; const lost = Math.floor(this.coins / 2); this.coins -= lost;
    this.hud.toast(`Você desmaiou e acordou em casa. Perdeu ${lost} moedas.`); this.flash('#000000', 1);
    this.hero.pos.set(HOME.x + 3, height(HOME.x + 3, HOME.z + 4), HOME.z + 4);
  }
  /** A dragon at zero health faints (three times). The fourth time, it dies for good. */
  private knockout(d: Dragon3D): void {
    if (this.mount === d) { const wasAir = d.air; this.dismount(); if (wasAir) { this.hero.hp -= 15; this.hud.toast('Vocês despencaram!'); } }
    // fainting over the sea: you both wash up on the nearest shore
    if (height(d.pos.x, d.pos.z) < SEA + 0.5) { const c = coastAt(Math.atan2(d.pos.z, d.pos.x), 12); d.pos.copy(c); this.hero.pos.set(c.x + 2, height(c.x + 2, c.z), c.z); this.flash('#0c0e1a', 1); }
    if (d.lives > 0) {
      d.lives--; d.rec.hp = 0; d.downT = 45; d.setState('down'); d.air = false; d.pos.y = Math.max(height(d.pos.x, d.pos.z), SEA);
      this.hud.toast(`${d.rec.name} desmaiou! ${d.lives === 0 ? 'Mais uma vez e ele morre para sempre.' : `Restam ${d.lives} chances.`}`);
      audio.voice('whine', { pitch: 0.4, rough: 0.3, size: d.ph.size }, 0.8);
    } else {
      d.vanish(); this.deadIds.push(d.rec.genes.id); this.fx.play('blessing', d.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1.6);
      this.hud.toast(`${d.rec.name} morreu. Nenhum dragão nasce igual: ele não volta mais.`); audio.play('death');
    }
    this.save();
  }
  private burst(p: THREE.Vector3, el: Element, r: number, dmg: number): void {
    this.fx.play(BURST[el], p, 2 + r / 6, { add: el === 'fire' || el === 'storm' }); this.fx.play('explosion', p, 1 + r / 10, { add: true });
    this.fx.puff(p, EL_COLOR[el], 30, 10, 0.8, -3); audio.play('crit'); this.shake = 0.6; this.flash('#ffffff', 0.15);
    for (const t of this.targets()) if (t.pos.distanceTo(p) < r + t.radius) t.hurt(dmg, el);
  }
  private flash(color: string, s: number): void { this.flashEl.style.background = color; this.flashEl.style.transition = 'none'; this.flashEl.style.opacity = '0.35'; requestAnimationFrame(() => { this.flashEl.style.transition = `opacity ${s}s`; this.flashEl.style.opacity = '0'; }); }

  // ── camera ─────────────────────────────────────────────────────────────
  private camera(dt: number): void {
    const m = this.mount, flying = !!m?.air;
    const focus = (m ? m.pos : this.hero.pos).clone().add(new THREE.Vector3(0, flying ? 2.2 : m ? 2.6 : 1.5, 0));
    const dist = flying ? 8.5 + Math.max(0, (m!.speed - 20) * 0.12) : m ? 8.5 : this.camDist;
    const pitch = flying ? 0.16 - m!.pitch * 0.35 : this.camPitch;
    const want = new THREE.Vector3(focus.x - Math.sin(this.camYaw) * Math.cos(pitch) * dist, focus.y + Math.sin(pitch) * dist, focus.z - Math.cos(this.camYaw) * Math.cos(pitch) * dist);
    const g = Math.max(height(want.x, want.z), SEA) + 0.8; if (want.y < g) want.y = g;
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want);
    this.camPos.lerp(want, Math.min(1, dt * (flying ? 6 : 10)));
    this.cam.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; this.cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)); }
    this.cam.lookAt(focus.x + (flying ? Math.sin(this.camYaw) * 6 : 0), focus.y + (flying ? 1.5 : 0.2), focus.z + (flying ? Math.cos(this.camYaw) * 6 : 0));
    if (flying) this.cam.rotateZ(-m!.roll * 0.12);
    const fov = flying ? 60 + Math.min(22, (m!.speed - 18) * 0.5) : 58; if (Math.abs(this.cam.fov - fov) > 0.1) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3); this.cam.updateProjectionMatrix(); }
  }

  // ── rendering ──────────────────────────────────────────────────────────
  private render(dt: number): void {
    this.fx.update(dt);
    this.seaTex.offset.x = this.time * 0.01; this.seaTex.offset.y = this.time * 0.006;
    this.sky.position.copy(this.cam.position);
    for (const c of this.clouds) { c.position.x += dt * 2; if (c.position.x > 1300) c.position.x = -1300; }
    this.hero.render(this.cam, this.tint);
    for (const v of this.villagers) v.p.render(this.cam, this.tint);
    for (const c of this.camps) for (const h of c.hunters) h.render(this.cam, this.tint);
    for (const d of this.dragons) d.render(this.cam, this.tint, (x, y, z, vis) => {
      if (d !== this.mount) return;
      this.rider.mesh.visible = vis; if (!vis) return;
      this.rider.mesh.position.set(x, y, z); this.rider.set('side_ride_0', this.cam.position.clone().sub(d.pos).cross(new THREE.Vector3(Math.sin(d.heading), 0, Math.cos(d.heading))).y > 0); this.rider.face(this.cam, d.air, d.air ? d.roll * 0.5 : 0); this.rider.mat.color.copy(this.tint);
    });
    if (!this.mount) this.rider.mesh.visible = false;
    this.hud.update(dt);
    this.renderer.render(this.scene, this.cam);
  }

  // ── save ───────────────────────────────────────────────────────────────
  save(): void {
    try {
      const dragons = this.dragons.filter((d) => d.rec.bonded || d.rec.trust > 5).map((d) => ({ id: d.rec.genes.id, trust: d.rec.trust, bonded: d.rec.bonded, x: d.pos.x, z: d.pos.z, memories: d.rec.memories, lives: d.lives, hp: d.rec.hp }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, hero: { x: this.hero.pos.x, z: this.hero.pos.z }, food: this.food, clock: this.clock, dayN: this.dayN, coins: this.coins, seeds: this.seeds, owned: this.owned, gear: this.gear, style: this.style, flags: this.flags, dead: this.deadIds, step: this.step, plots: this.plots.map((p) => [p.state, p.water, p.lastWater]), dragons }));
    } catch { /* private mode */ }
  }
  private saved: { dragons?: { id: string; trust: number; bonded: boolean; x: number; z: number; memories: never[]; lives: number; hp: number }[]; plots?: [Plot['state'], number, number][] } = {};
  private load(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const s = JSON.parse(raw);
      this.hero.pos.set(s.hero.x, height(s.hero.x, s.hero.z), s.hero.z); this.food = { ...this.food, ...s.food }; this.clock = s.clock ?? 0.3; this.dayN = s.dayN ?? 1; this.coins = s.coins ?? 30; this.seeds = s.seeds ?? 4;
      this.owned = s.owned ?? this.owned; this.gear = s.gear ?? this.gear; this.style = s.style ?? this.style; this.flags = s.flags ?? {}; this.deadIds = s.dead ?? []; this.step = s.step ?? 0;
      this.saved = { dragons: s.dragons, plots: s.plots };
    } catch { /* corrupt save: start fresh */ }
  }
  private applyDragonSave(): void {
    for (const id of this.deadIds) { const d = this.dragons.find((x) => x.rec.genes.id === id); d?.vanish(); }
    for (const sd of this.saved.dragons ?? []) {
      const d = this.dragons.find((x) => x.rec.genes.id === sd.id); if (!d || d.dead) continue;
      d.rec.trust = sd.trust; d.rec.bonded = sd.bonded; d.rec.memories = sd.memories ?? []; d.rec.met = true; d.lives = sd.lives ?? 3; d.rec.hp = sd.hp ?? d.ph.stats.maxHp;
      if (sd.bonded) { d.rec.follow = true; d.setState('follow'); d.pos.set(this.hero.pos.x + 3, this.hero.pos.y, this.hero.pos.z + 2); d.repaintRider(this.style); } else d.pos.set(sd.x, height(sd.x, sd.z), sd.z);
    }
  }
  restorePlots(): void { (this.saved.plots ?? []).forEach(([st, w, lw], i) => { const p = this.plots[i]; if (!p) return; p.state = st; p.water = w; p.lastWater = lw; if (st !== 'empty') this.cropMesh(p, st === 'ready'); }); }
  hasSave(): boolean { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
}
function angDiff(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// ── boot ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game') as HTMLCanvasElement, hudRoot = document.getElementById('hud')!;
const game = new Game(canvas, hudRoot);
game.restorePlots();
const ready = (): void => { game.afterFx(); game.hud.title(() => { if (!game.hasSave()) game.openCreator(() => game.start()); else game.start(); }, () => game.openCreator()); };
game.fx.load().then(ready).catch(ready);
let last = performance.now();
const loop = (t: number): void => { game.tick(Math.min(0.1, (t - last) / 1000)); last = t; requestAnimationFrame(loop); };
requestAnimationFrame(loop);
if (DEBUG) Object.assign(window, { __game: game, __input: input });
