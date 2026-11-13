import Phaser from 'phaser';
import { Pix, mix } from '../art/Pix';
import { pixToTexture } from '../art/runtime';
import { THEMES } from '../art/themes';
import { audio } from '../audio/AudioManager';
import { DEBUG, GAME_H } from '../core/constants';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { particleScale, settings } from '../core/settings';
import { ITEM_NAMES, game } from '../core/state';
const k0 = (): number => particleScale();
import type { DragonRecord } from '../dragons/DragonRecord';
import { DragonTextures } from '../dragons/rendering/DragonTextures';
import { input } from '../input/InputManager';
import { clamp, hashInts, mulberry32 } from '../utils/rng';
import { VfxManager } from '../vfx/VfxManager';
import { mulColor } from '../world/Backdrop';
import { CHUNK, MAIN_SITES, OCEAN_H, OCEAN_W, allSites, biomeAt, currentAt, type IslandSite } from '../world/generation/archipelago';
import { ISL_RX, ISL_RY, islandDist, paintIslandTop } from '../world/ocean/islandTop';
import type { ItemId } from '../world/islands/types';
import type { IslandEntry } from './IslandScene';

type CreatureKind = 'fish' | 'fin' | 'reef' | 'crate' | 'serpent';
interface Creature { kind: CreatureKind; x: number; y: number; hp: number; img: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; segs?: Phaser.GameObjects.Image[]; trail?: { x: number; y: number }[]; t: number; a: number; cd: number; chunk: string; id: string; alive: boolean }
interface Shot { img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; x: number; y: number; vx: number; vy: number; t: number; dmg: number; fx: boolean }
const DIRS = ['L', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'];

/**
 * The open sea at archipelago scale (top-down). Islands, reefs and creatures stream in and out
 * by chunk; the boat obeys wind, currents and storms; a bonded dragon turns the map into sky.
 */
export class OceanScene extends Phaser.Scene {
  private sites: IslandSite[] = []; private siteSprites = new Map<string, Phaser.GameObjects.Image>();
  private chunks = new Map<string, Creature[]>(); private creatures: Creature[] = []; private shots: Shot[] = [];
  private waterA!: Phaser.GameObjects.TileSprite; private waterB!: Phaser.GameObjects.TileSprite; private base!: Phaser.GameObjects.Rectangle; private tint!: Phaser.GameObjects.Rectangle;
  private vessel!: Phaser.GameObjects.Sprite; private shadow!: Phaser.GameObjects.Ellipse; private rain!: Phaser.GameObjects.Particles.ParticleEmitter; private clouds: Phaser.GameObjects.Image[] = [];
  private vfx!: VfxManager;
  private x = 0; private y = 0; private a = 0; private speed = 0; private vx = 0; private vy = 0;
  private flying = false; private comp: DragonRecord | null = null; private stamina = 100; private dashT = 0; private dashCd = 0; private ghostT = 0; private alt = 1; private bank = 0; private lastA = 0; private sprayT = 0;
  /** the rest of the party: wingmates in formation behind the rider (or circling over the boat) */
  private vign: Phaser.GameObjects.Image | null = null;
  private wings: { rec: DragonRecord; spr: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Ellipse; x: number; y: number; a: number; ph: number }[] = [];
  private skyClouds: { img: Phaser.GameObjects.Image; sx: number; sy: number; sf: number }[] = []; private lastCam = { x: 0, y: 0 }; private cd = 0; private inv = 0;
  private storm = 0; private windA = 0; private boltT = 3; private t = 0; private saveT = 20; private leaving = false; private near: IslandSite | null = null; private frameT = 0; private wf = 0;
  private data0: { from?: string; heading?: number; resume?: boolean } = {};

  constructor() { super('Ocean'); }
  init(d: { from?: string; heading?: number; resume?: boolean }): void { this.data0 = d ?? {}; }

  create(): void {
    const o = game.save.ocean, W = this.scale.width;
    this.sites = allSites(game.save.worldSeed); this.siteSprites.clear(); this.chunks.clear(); this.creatures = []; this.shots = []; this.clouds = []; this.leaving = false; this.near = null;
    this.x = clamp(o.x, 60, OCEAN_W - 60); this.y = clamp(o.y, 60, OCEAN_H - 60); this.a = this.data0.heading ?? Math.PI; this.speed = 20; this.vx = this.vy = 0;
    this.comp = game.companion && game.canRide(game.companion) ? game.companion : null;
    this.flying = o.flying && !!this.comp; o.atSea = true; o.flying = this.flying;
    this.stamina = this.comp ? game.phenotype(this.comp).stats.stamina : 0;
    this.vfx = new VfxManager(this);
    this.base = this.add.rectangle(0, 0, W, GAME_H, THEMES.tropical.seaDeep).setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.waterA = this.add.tileSprite(0, 0, W, GAME_H, 'ocean', 'water_0').setOrigin(0).setScrollFactor(0).setDepth(-9).setAlpha(0.6);
    this.waterB = this.add.tileSprite(0, 0, W, GAME_H, 'ocean', 'water_2').setOrigin(0).setScrollFactor(0).setDepth(-8).setAlpha(0.5).setTileScale(2);
    this.shadow = this.add.ellipse(0, 0, 34, 12, 0x000020, 0.28).setDepth(3);
    this.vessel = this.add.sprite(this.x, this.y, 'ocean', 'boat_0').setDepth(10);
    this.applyVessel();
    this.rain = this.add.particles(0, 0, 'ui', { frame: 'white', x: { min: -40, max: 620 }, y: -6, lifespan: 600, speedY: { min: 380, max: 460 }, speedX: { min: -130, max: -80 }, scaleX: 0.25, scaleY: { min: 1.5, max: 3 }, tint: 0xb8d0f0, alpha: 0.55, frequency: -1 }).setScrollFactor(0).setDepth(60);
    for (let i = 0; i < 5; i++) this.clouds.push(this.add.image(this.x + (i - 2) * 300, this.y + ((i * 173) % 400) - 200, 'ocean', 'cloudshadow').setScale(3).setDepth(4));
    this.makeSkyCloud();
    this.skyClouds = [];
    for (let i = 0; i < 6; i++) this.skyClouds.push({ img: this.add.image(0, 0, 'sea-cloud').setScrollFactor(0).setDepth(46).setAlpha(0.5).setScale(1 + (i % 3) * 0.5).setFlipX(i % 2 === 1), sx: (i * 211) % W, sy: (i * 97) % GAME_H, sf: 1.25 + (i % 3) * 0.12 });
    this.tint = this.add.rectangle(0, 0, W, GAME_H, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(80).setBlendMode(Phaser.BlendModes.MULTIPLY);
    if (!this.textures.exists('flight-vignette')) {
      const c = this.textures.createCanvas('flight-vignette', 256, 144)!, x = c.getContext();
      const gr = x.createRadialGradient(128, 72, 40, 128, 72, 150); gr.addColorStop(0, 'rgba(8,10,24,0)'); gr.addColorStop(0.6, 'rgba(8,10,24,0.15)'); gr.addColorStop(1, 'rgba(8,10,24,0.85)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 144); c.refresh();
    }
    this.vign = this.add.image(0, 0, 'flight-vignette').setOrigin(0).setScrollFactor(0).setDepth(81).setAlpha(0);
    this.alt = 1; this.bank = 0; this.lastA = this.a;
    this.wings = game.party().filter((r) => r !== this.comp).slice(0, 5).map((rec, i) => {
      const key = DragonTextures.ensureTop(this, rec, false);
      const spr = this.add.sprite(this.x, this.y, key, 'f0').setDepth(29).play({ key, startFrame: i % 6 });
      spr.anims.timeScale = 0.8 + (i % 3) * 0.12;
      return { rec, spr, sh: this.add.ellipse(this.x, this.y, 26, 9, 0x000020, 0.2).setDepth(3), x: this.x - 40 * (i + 1), y: this.y, a: this.a, ph: i * 1.7 };
    });
    const cam = this.cameras.main;
    cam.setBounds(0, 0, OCEAN_W, OCEAN_H).setRoundPixels(true).centerOn(this.x, this.y); cam.fadeIn(450, 8, 6, 16);
    hud.mode = this.flying ? 'oceanFlight' : 'boat'; hud.prompt = null; hud.focusId = null;
    events.emit('areaTitle', { title: 'Mar Aberto', subtitle: this.flying ? 'Nas asas do vento' : 'Vento, correntes e horizonte' });
    if (!this.data0.resume && !this.flying) events.emit('toast', { text: 'Mova para manobrar e acelerar. Aproxime-se de uma ilha para desembarcar.', icon: 'boat' });
    audio.setMusic('ocean');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { DragonTextures.dispose(this); for (const k of this.textures.getTextureKeys()) if (k.startsWith('isl-')) this.textures.remove(k); hud.compass = null; hud.minimap = null; input.clearVirtual(); });
    if (DEBUG) (window as unknown as Record<string, unknown>).__ocean = this;
  }

  /** Soft white cumulus seen from above (drawn over the dragon, at stronger parallax, so it reads as higher up). */
  private makeSkyCloud(): void {
    if (this.textures.exists('sea-cloud')) return;
    const p = new Pix(96, 60);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.283, r = 12 + ((k * 7) % 6); p.ellipse(48 + Math.cos(a) * 22, 30 + Math.sin(a) * 12, r * 1.2, r, 0xffffff); }
    p.ellipse(48, 30, 26, 16, 0xffffff);
    for (let y = 0; y < 60; y++) for (let x = 0; x < 96; x++) if (p.solid(x, y) && (!p.solid(x + 3, y + 3) || !p.solid(x + 2, y + 4))) p.px(x, y, 0xd8e6f4);
    pixToTexture(this, 'sea-cloud', p);
  }

  private applyVessel(): void {
    if (this.flying && this.comp) { const key = DragonTextures.ensureTop(this, this.comp, true); this.vessel.setTexture(key, 'f0').play(key).setDepth(30); }
    else { this.vessel.anims.stop(); this.vessel.setTexture('ocean', 'boat_0').setDepth(10); }
    hud.mode = this.flying ? 'oceanFlight' : 'boat';
  }

  // ── streaming ───────────────────────────────────────────────────────────
  private stream(): void {
    const cam = this.cameras.main, cx = cam.worldView.centerX, cy = cam.worldView.centerY;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - cx, s.y - cy) - s.r * 1.4, has = this.siteSprites.get(s.id);
      if (d < 520 && !has) {
        const key = 'isl-' + s.id;
        if (!this.textures.exists(key)) pixToTexture(this, key, paintIslandTop(s));
        this.siteSprites.set(s.id, this.add.image(s.x, s.y, key).setScale(2).setDepth(5));
      } else if (d > 900 && has) { has.destroy(); this.siteSprites.delete(s.id); this.textures.remove('isl-' + s.id); }
    }
    const c0x = Math.floor(cx / CHUNK), c0y = Math.floor(cy / CHUNK), want = new Set<string>();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) want.add(`${c0x + i},${c0y + j}`);
    for (const key of want) if (!this.chunks.has(key)) this.spawnChunk(key);
    for (const [key, list] of this.chunks) if (!want.has(key)) { for (const c of list) { c.img.destroy(); c.segs?.forEach((s) => s.destroy()); c.alive = false; } this.chunks.delete(key); }
    this.creatures = this.creatures.filter((c) => c.alive);
  }

  private spawnChunk(key: string): void {
    const [cx, cy] = key.split(',').map(Number), list: Creature[] = [];
    this.chunks.set(key, list);
    if (cx < 0 || cy < 0 || cx * CHUNK > OCEAN_W || cy * CHUNK > OCEAN_H) return;
    const r = mulberry32(hashInts(game.save.worldSeed, cx, cy, 0x5ea)), taken = game.islandState('sea').taken;
    const place = (): [number, number] | null => { for (let k = 0; k < 6; k++) { const x = cx * CHUNK + r() * CHUNK, y = cy * CHUNK + r() * CHUNK; if (!this.sites.some((s) => islandDist(s, x, y) < 1.45)) return [x, y]; } return null; };
    const add = (kind: CreatureKind, n: number): void => {
      const pos = place(); if (!pos) return;
      const id = `${key}:${kind}${n}`; if (kind === 'crate' && taken.includes(id)) return;
      const frame = { fish: 'fish_0', fin: 'fin_0', reef: 'reef', crate: 'crate', serpent: 'serpent_head' }[kind];
      const c: Creature = { kind, x: pos[0], y: pos[1], hp: kind === 'serpent' ? 8 : kind === 'fin' ? 3 : 1, img: this.add.image(pos[0], pos[1], 'ocean', frame).setDepth(kind === 'fish' ? 2 : kind === 'serpent' ? 9 : 8), t: r() * 6, a: r() * 6.28, cd: 2, chunk: key, id, alive: true };
      if (kind === 'serpent') { c.segs = []; c.trail = []; for (let i = 0; i < 7; i++) c.segs.push(this.add.image(c.x, c.y, 'ocean', i === 6 ? 'serpent_tail' : 'serpent_body').setDepth(8).setScale(1 - i * 0.05)); }
      list.push(c); this.creatures.push(c);
    };
    const biome = biomeAt(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2);
    const nFish = Math.floor(r() * 3); for (let i = 0; i < nFish; i++) add('fish', i);
    const nReef = Math.floor(r() * (biome === 'storm' ? 4 : 2.4)); for (let i = 0; i < nReef; i++) add('reef', i);
    if (r() < 0.4) add('crate', 0);
    if (r() < (biome === 'tropical' ? 0.25 : 0.5)) add('fin', 0);
    if (biome !== 'tropical' && r() < 0.3) add('serpent', 0);
  }

  // ── actions ─────────────────────────────────────────────────────────────
  private land(site: IslandSite): void {
    if (this.leaving) return; this.leaving = true;
    const o = game.save.ocean; o.atSea = false; o.x = this.x; o.y = this.y;
    const entry: IslandEntry['entry'] = this.flying ? (this.x < site.x ? 'air-west' : 'air-east') : 'dock';
    o.flying = false; audio.setWindBoost(0);
    this.cameras.main.fadeOut(400, 8, 6, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Island', { islandId: site.id, entry } satisfies IslandEntry));
  }
  private wreck(): void {
    if (this.leaving) return; this.leaving = true;
    audio.play('death'); this.vfx.play('wavecrash', this.x, this.y + 10);
    events.emit('toast', { text: 'O barco afundou. A maré te devolveu à última fogueira.' });
    const o = game.save.ocean; o.atSea = false; o.flying = false; o.boatHp = 100;
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Island', { islandId: game.save.player.checkpoint.island, entry: 'respawn' } satisfies IslandEntry));
  }
  private fire(): void {
    if (this.cd > 0) return;
    const ca = Math.cos(this.a), sa = Math.sin(this.a);
    if (this.flying && this.comp) {
      if (this.stamina < 6) return;
      this.cd = 0.55; this.stamina -= 6;
      const el = game.phenotype(this.comp).element, key = { fire: 'fireball', water: 'waterjet', nature: 'leafstorm', storm: 'sparkarc', earth: 'dirt', ice: 'icelance' }[el];
      const img = this.vfx.play(key, this.x + ca * 22, this.y + sa * 22, { loop: true, scale: 0.6, angle: Phaser.Math.RadToDeg(this.a), depth: 31, add: el === 'fire' || el === 'storm' });
      if (img) this.shots.push({ img, x: this.x + ca * 22, y: this.y + sa * 22, vx: ca * 330 + this.vx, vy: sa * 330 + this.vy, t: 0.9, dmg: 3, fx: true });
      audio.play(el === 'fire' ? 'fire' : el === 'ice' ? 'ice' : el === 'storm' ? 'zap' : el === 'water' ? 'water' : 'spore', 0.7);
    } else {
      this.cd = 0.7;
      const img = this.add.image(this.x, this.y, 'ocean', 'streak').setRotation(this.a).setDepth(12).setTint(0xf0e0c0);
      this.shots.push({ img, x: this.x + ca * 16, y: this.y + sa * 16, vx: ca * 260 + this.vx, vy: sa * 260 + this.vy, t: 0.8, dmg: 1, fx: false });
      audio.play('dash', 0.6);
    }
  }
  private hurtVessel(dmg: number, fromX: number, fromY: number): void {
    if (this.inv > 0) return; this.inv = 1;
    const a = Math.atan2(this.y - fromY, this.x - fromX); this.vx += Math.cos(a) * 70; this.vy += Math.sin(a) * 70; this.speed *= 0.4;
    this.cameras.main.shake(140, 0.004 * settings.screenShake); this.vfx.play('splash', this.x, this.y, { scale: 0.8 }); audio.play('hit');
    if (this.flying) { const p = game.save.player; p.hp = Math.max(1, p.hp - 1); events.emit('hudDirty'); this.stamina = Math.max(0, this.stamina - 15); }
    else { game.save.ocean.boatHp -= dmg; if (game.save.ocean.boatHp <= 0) this.wreck(); }
  }

  // ── loop ────────────────────────────────────────────────────────────────
  override update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30), W = this.scale.width, inp = input, o = game.save.ocean;
    hud.fps = this.game.loop.actualFps; hud.entities = this.creatures.length; hud.fxCount = this.vfx.activeCount;
    inp.update(); audio.update(dt, game.daylight);
    if (hud.inMenu || this.leaving) return;
    if (hud.dialog) return;
    if (inp.pressed('pause')) { events.emit('openMenu', undefined); return; }
    if (inp.pressed('map')) { events.emit('openMenu', { tab: 'map' }); return; }
    game.tick(dt); this.t += dt; this.cd -= dt; this.inv -= dt; this.dashT -= dt; this.dashCd -= dt; this.ghostT -= dt;

    // weather: the storm island drags a permanent tempest; fronts wander elsewhere
    const st = MAIN_SITES[2], front = Math.max(0, Math.sin(this.t * 0.02 + this.x / 2600 + this.y / 1900 + 3.6) - 0.8) * 4;
    this.storm = clamp(Math.max(1.25 - Math.hypot(this.x - st.x, this.y - st.y) / 1300, front), 0, 1);
    this.windA = 0.4 + Math.sin(this.t * 0.03) * 0.9;
    const windV = 14 + this.storm * 40, wx = Math.cos(this.windA) * windV, wy = Math.sin(this.windA) * windV, cur = currentAt(this.x, this.y);

    const ix = inp.axisX, iy = inp.axisY, mag = Math.hypot(ix, iy);
    if (this.flying && this.comp) {
      const ph = game.phenotype(this.comp), tired = this.stamina <= 0;
      if (mag > 0.2) { const want = Math.atan2(iy, ix); this.a = Phaser.Math.Angle.RotateTo(this.a, want, (2.2 + ph.stats.agility * 1.4) * dt); }
      const maxV = ph.stats.flySpeed * 0.62 * (tired ? 0.5 : 1) * (this.dashT > 0 ? 1.9 : 1) * (inp.down('jump') && !tired ? 1.3 : 1);
      this.speed += ((mag > 0.2 ? maxV : maxV * 0.55) - this.speed) * Math.min(1, dt * 1.8);
      const tail = Math.cos(this.a - this.windA);
      this.stamina = clamp(this.stamina + (tail > 0.5 ? 5 : -2.2 - (inp.down('jump') ? 4 : 0) - this.storm * (ph.abilities.includes('stormRider') ? 0 : 3)) * dt, 0, ph.stats.stamina);
      if (inp.pressed('dash') && this.dashCd <= 0 && this.stamina > 10) { this.dashT = 0.3; this.dashCd = 0.8; this.stamina -= 10; this.inv = 0.4; this.speed = maxV; audio.play('dash'); }
      // altitude: a dash is a diving swoop down to the waves; otherwise the dragon climbs back to cruising height
      this.alt += ((this.dashT > 0 ? 0.15 : inp.down('jump') ? 0.75 : 1) - this.alt) * Math.min(1, dt * (this.dashT > 0 ? 6 : 1.2));
      if (this.dashT > 0 && this.ghostT <= 0) { this.ghostT = 0.04; const g = this.add.image(this.vessel.x, this.vessel.y, this.vessel.texture.key, this.vessel.frame.name).setRotation(this.a).setDepth(29).setTint(0x9fe8ff).setTintMode(Phaser.TintModes.FILL).setAlpha(0.5); this.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() }); }
      this.vx += (Math.cos(this.a) * this.speed + wx * 0.5 - this.vx) * Math.min(1, dt * 3); this.vy += (Math.sin(this.a) * this.speed + wy * 0.5 - this.vy) * Math.min(1, dt * 3);
      if (this.storm > 0.6 && !ph.abilities.includes('stormRider')) { this.vx += Math.sin(this.t * 3.1) * 40 * dt; this.vy += Math.cos(this.t * 2.3) * 40 * dt; }
      hud.stamina = this.stamina; hud.staminaMax = ph.stats.stamina; audio.setWindBoost(this.speed / (ph.stats.flySpeed * 0.8));
      // wingbeat follows effort; wings sweep back while swooping
      if (this.dashT > 0 || (this.alt < 0.4 && this.dashT > -0.2)) { this.vessel.anims.pause(); this.vessel.setFrame('f6'); }
      else { if (this.vessel.anims.isPaused) this.vessel.anims.resume(); this.vessel.anims.timeScale = tired ? 1.3 : inp.down('jump') ? 1.7 : mag > 0.2 ? 1 : 0.7; }
      if (inp.pressed('attack') || inp.pressed('ability')) this.fire();
    } else {
      // sail: steer with the stick; forward push fills the sail, wind astern helps
      if (mag > 0.2) { const want = Math.atan2(iy, ix); this.a = Phaser.Math.Angle.RotateTo(this.a, want, (0.7 + Math.min(1, this.speed / 40) * 1.3) * dt); }
      const tail = Math.cos(this.a - this.windA), maxV = 62 * (1 + tail * 0.28) * (1 - this.storm * 0.15);
      this.speed += ((mag > 0.2 ? maxV * Math.min(1, mag) : 0) - this.speed) * Math.min(1, dt * (mag > 0.2 ? 0.9 : 0.5));
      // keel: forward motion is cheap, sideways drift is damped; currents and storm swell push the hull
      const fx = Math.cos(this.a) * this.speed + cur.x + wx * 0.12, fy = Math.sin(this.a) * this.speed + cur.y + wy * 0.12;
      this.vx += (fx - this.vx) * Math.min(1, dt * 2.2); this.vy += (fy - this.vy) * Math.min(1, dt * 2.2);
      if (this.storm > 0.4) { this.vx += Math.sin(this.t * 1.7) * 26 * this.storm * dt; this.vy += Math.cos(this.t * 1.3) * 26 * this.storm * dt; }
      hud.boatHp = o.boatHp;
      if (inp.pressed('attack')) this.fire();
      if (inp.pressed('mount')) {
        if (this.comp) { this.flying = true; o.flying = true; this.applyVessel(); game.save.stats.flights++; audio.play('flap'); this.vfx.play('splash', this.x, this.y, {}); events.emit('toast', { text: `${this.comp.name} decola do convés!`, icon: 'wing' }); }
        else events.emit('toast', { text: game.companion ? `${game.companion.name} ainda não pode carregar você.` : 'Você ainda não tem um dragão para montar.' });
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, 30, OCEAN_W - 30); this.y = clamp(this.y, 30, OCEAN_H - 30);

    // islands: shoreline collision for the boat, landing prompts, discovery
    this.near = null; let nearest: IslandSite | null = null, nd = 1e9;
    for (const s of this.sites) {
      const d = islandDist(s, this.x, this.y), px = Math.hypot(s.x - this.x, s.y - this.y);
      if (!o.discovered.includes(s.id)) { if (px < s.r * 1.4 + 260) { o.discovered.push(s.id); events.emit('toast', { text: `Ilha avistada: ${s.name}`, icon: 'star' }); audio.play('pickup'); } }
      if (px < nd && s.id !== this.data0.from) { nd = px; nearest = s; }
      if (!this.flying && d < 1.02) { const ax = (this.x - s.x) / (s.r * ISL_RX), ay = (this.y - s.y) / (s.r * ISL_RY), m = Math.hypot(ax, ay) || 1; this.x = s.x + (ax / m) * 1.03 * s.r * ISL_RX; this.y = s.y + (ay / m) * 1.03 * s.r * ISL_RY; this.speed *= 0.5; this.vx *= 0.3; this.vy *= 0.3; }
      if (d < (this.flying ? 1.05 : 1.32)) this.near = s;
    }
    hud.prompt = this.near ? `${this.flying ? 'Pousar em' : 'Desembarcar em'} ${this.near.name}` : null; hud.promptAction = 'interact';
    if (this.near && inp.pressed('interact')) { this.land(this.near); return; }
    if (nearest) { const ang = Math.atan2(nearest.y - this.y, nearest.x - this.x); hud.compass = { angle: ang, label: `${o.discovered.includes(nearest.id) ? nearest.name : 'Terra à vista?'} · ${DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]} · ${Math.round(nd / 10)} braças` }; }

    hud.minimap = { kind: 'ocean', x: this.x, y: this.y, a: this.a, flying: this.flying };
    this.updateCreatures(dt);
    this.updateShots(dt);
    this.stream();
    this.render(time, dt, W, cur);
    if ((this.saveT -= dt) <= 0) { this.saveT = 30; o.x = this.x; o.y = this.y; void game.persist().catch(() => undefined); }
    this.vfx.update();
  }

  /** Wingmates: a loose V behind the rider that banks with the turns; over the boat they circle lazily. */
  private updateWings(time: number, dt: number): void {
    const SLOTS = [[-34, -30], [-34, 30], [-64, -54], [-64, 54], [-92, 0]];
    this.wings.forEach((w, i) => {
      let tx: number, ty: number, ta: number;
      if (this.flying) {
        const [bx, by] = SLOTS[i], c = Math.cos(this.a), sn = Math.sin(this.a);
        const sway = Math.sin(time / 700 + w.ph) * 6;
        tx = this.x + bx * c - (by + sway) * sn; ty = this.y + bx * sn + (by + sway) * c; ta = this.a;
      } else {
        const ang = time / 2600 + w.ph, r = 46 + i * 10;
        tx = this.x + Math.cos(ang) * r; ty = this.y + Math.sin(ang) * r * 0.7; ta = ang + Math.PI / 2;
      }
      const k = Math.min(1, dt * (this.dashT > 0 ? 2.2 : 3.2));
      w.x += (tx - w.x) * k; w.y += (ty - w.y) * k; w.a = Phaser.Math.Angle.RotateTo(w.a, ta, dt * 3);
      const lift = this.flying ? 8 + this.alt * 14 + Math.sin(time / 500 + w.ph) * 2 : 22;
      w.spr.setPosition(Math.round(w.x), Math.round(w.y - lift)).setRotation(w.a).setScale(0.85, 0.85 * (1 - Math.abs(this.flying ? this.bank : 0.3) * 0.25));
      w.sh.setPosition(w.x + 4 + lift * 0.5, w.y + 4 + lift * 0.4).setRotation(w.a).setAlpha(0.12 + (this.flying ? (1 - this.alt) * 0.15 : 0.05));
      if (this.flying && this.alt < 0.45 && Math.random() < dt * 10) this.vfx.puff(w.x, w.y + 4, 0xe8f6ff, 2, { speed: 40, gravity: 120, life: 320, spread: 70 });
    });
  }

  private updateCreatures(dt: number): void {
    for (const c of this.creatures) {
      if (!c.alive) continue;
      c.t += dt; c.cd -= dt;
      const dx = this.x - c.x, dy = this.y - c.y, d = Math.hypot(dx, dy);
      switch (c.kind) {
        case 'fish':
          c.x += Math.cos(c.a) * 14 * dt; c.y += Math.sin(c.a) * 14 * dt; c.a += Math.sin(c.t) * 0.4 * dt;
          (c.img as Phaser.GameObjects.Image).setFrame(Math.floor(c.t * 3) % 2 ? 'fish_1' : 'fish_0').setRotation(c.a);
          if (d < 22 && !this.flying && c.cd <= 0) { c.cd = 40; game.addItem('fish'); events.emit('toast', { text: '+1 Peixe', icon: 'fish' }); audio.play('splash', 0.6); this.vfx.play('splash', c.x, c.y, { scale: 0.5 }); c.img.setAlpha(0.3); }
          if (c.cd < 1) c.img.setAlpha(1);
          break;
        case 'reef': if (!this.flying && d < 17) this.hurtVessel(14, c.x, c.y); break;
        case 'crate':
          c.img.setY(c.y + Math.sin(c.t * 2) * 1.5);
          if (d < 20 && !this.flying) { const loot = (['berry', 'herb', 'fish', 'meat', 'shell', 'ember'] as ItemId[])[hashInts(c.x | 0, c.y | 0) % 6]; game.addItem(loot, 2); game.islandState('sea').taken.push(c.id); events.emit('toast', { text: `Caixote à deriva: +2 ${ITEM_NAMES[loot]}`, icon: loot }); audio.play('chest'); c.alive = false; c.img.destroy(); }
          break;
        case 'fin': {
          const chase = d < 190 && !this.flying;
          c.a = Phaser.Math.Angle.RotateTo(c.a, chase ? Math.atan2(dy, dx) : c.a + 0.6, (chase ? 1.6 : 0.5) * dt);
          const sp = chase ? 58 : 22; c.x += Math.cos(c.a) * sp * dt; c.y += Math.sin(c.a) * sp * dt;
          (c.img as Phaser.GameObjects.Image).setFrame(Math.floor(c.t * 4) % 2 ? 'fin_1' : 'fin_0').setFlipX(Math.cos(c.a) < 0);
          if (chase && d < 16 && c.cd <= 0) { c.cd = 2.5; this.hurtVessel(9, c.x, c.y); c.a += Math.PI; }
          break;
        }
        case 'serpent': {
          const chase = d < 260;
          c.a = Phaser.Math.Angle.RotateTo(c.a, chase ? Math.atan2(dy, dx) + Math.sin(c.t * 2) * 0.5 : c.a + 0.3, 1.5 * dt);
          const sp = chase ? (c.cd < 0.5 ? 120 : 60) : 26; c.x += Math.cos(c.a) * sp * dt; c.y += Math.sin(c.a) * sp * dt;
          c.img.setRotation(c.a);
          c.trail!.unshift({ x: c.x, y: c.y }); if (c.trail!.length > 90) c.trail!.pop();
          c.segs!.forEach((s, i) => { const p = c.trail![Math.min(c.trail!.length - 1, (i + 1) * 9)], q = c.trail![Math.min(c.trail!.length - 1, (i + 1) * 9 + 3)]; s.setPosition(p.x, p.y).setRotation(Math.atan2(p.y - q.y, p.x - q.x)).setVisible(Math.sin(c.t * 2 + i) > -0.6); });
          if (chase && d < 22 && c.cd <= 0) { c.cd = 3; this.hurtVessel(16, c.x, c.y); audio.voice('roar', { pitch: 0.2, rough: 1, size: 1.6 }); }
          if (chase && c.cd <= 0 && d > 200) c.cd = 2.5;
          break;
        }
      }
      if (c.kind !== 'crate') c.img.setPosition(Math.round(c.x), Math.round(c.y));
    }
  }

  private updateShots(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt;
      s.img.setPosition(s.x, s.y);
      let hit = false;
      for (const c of this.creatures) if (c.alive && (c.kind === 'fin' || c.kind === 'serpent') && Math.hypot(c.x - s.x, c.y - s.y) < (c.kind === 'serpent' ? 18 : 12)) {
        c.hp -= s.dmg; hit = true; this.vfx.play('hit', c.x, c.y + 6, { scale: 0.7 }); audio.play('hit'); c.cd = Math.max(c.cd, 1); c.a += Math.PI * 0.7;
        if (c.hp <= 0) { c.alive = false; c.img.destroy(); c.segs?.forEach((g) => g.destroy()); this.vfx.play('splash', c.x, c.y, {}); game.addItem('meat', c.kind === 'serpent' ? 3 : 1); events.emit('toast', { text: c.kind === 'serpent' ? 'Serpe-do-mar derrotada! +3 Carne' : '+1 Carne', icon: 'meat' }); }
        break;
      }
      if (hit || s.t <= 0) { if (!hit) this.vfx.play('splash', s.x, s.y, { scale: 0.4 }); if (s.fx) this.vfx.release(s.img as Phaser.GameObjects.Sprite); else s.img.destroy(); this.shots.splice(i, 1); }
    }
  }

  private render(time: number, dt: number, W: number, cur: { x: number; y: number }): void {
    const cam = this.cameras.main, light = game.daylight, biome = biomeAt(this.x, this.y), th = THEMES[biome];
    cam.scrollX += (this.x + this.vx * 0.5 - W / 2 - cam.scrollX) * Math.min(1, dt * 4); cam.scrollY += (this.y + this.vy * 0.5 - GAME_H / 2 - cam.scrollY) * Math.min(1, dt * 4);
    this.base.setSize(W, GAME_H).setFillStyle(mix(mix(th.sea, th.seaDeep, 0.55), 0x1a2238, this.storm * 0.5));
    if ((this.frameT -= dt) <= 0) { this.frameT = 0.22; this.wf = (this.wf + 1) % 4; this.waterA.setFrame(`water_${this.wf}`); this.waterB.setFrame(`water_${(this.wf + 2) % 4}`); }
    this.waterA.setSize(W, GAME_H); this.waterB.setSize(W, GAME_H);
    this.waterA.tilePositionX = cam.scrollX + this.t * (6 + cur.x); this.waterA.tilePositionY = cam.scrollY + this.t * cur.y;
    this.waterB.tilePositionX = (cam.scrollX + this.t * 14) / 2; this.waterB.tilePositionY = (cam.scrollY - this.t * 5) / 2;
    let tint = mix(0x56609c, 0xffffff, Math.min(1, light * 1.15)); tint = mulColor(tint, mix(0xffffff, 0x8e98b8, this.storm));
    this.tint.setSize(W + 4, GAME_H + 4).setFillStyle(tint);
    // vessel
    const bob = this.flying ? 0 : Math.sin(time / 300) * (1 + this.storm * 2);
    const lift = this.flying ? 6 + this.alt * 12 : 0;
    this.vessel.setPosition(Math.round(this.x), Math.round(this.y + bob - lift)).setRotation(this.a).setAlpha(this.inv > 0 && Math.floor(this.inv * 16) % 2 ? 0.4 : 1);
    if (this.flying) {
      // bank into turns: the wing axis (sprite's local Y) foreshortens and the body slides toward the turn
      const turn = Phaser.Math.Angle.Wrap(this.a - this.lastA) / Math.max(dt, 1e-3);
      this.bank += (Phaser.Math.Clamp(turn * 0.45, -1, 1) - this.bank) * Math.min(1, dt * 6);
      const sc = 0.92 + this.alt * 0.12;
      this.vessel.setScale(sc, sc * (1 - Math.abs(this.bank) * 0.3));
      const off = this.bank * 3; this.vessel.x += Math.round(-Math.sin(this.a) * off); this.vessel.y += Math.round(Math.cos(this.a) * off);
      // the shadow lies on the water: farther and fainter the higher we fly
      this.shadow.setPosition(this.x + 4 + this.alt * 8, this.y + 4 + this.alt * 10).setVisible(true).setRotation(this.a).setScale(1.2 - this.alt * 0.35, 1).setAlpha(0.18 + (1 - this.alt) * 0.22);
      if (this.alt < 0.45 && (this.sprayT -= dt) <= 0) { this.sprayT = 0.05; this.vfx.puff(this.x - Math.cos(this.a) * 10, this.y - Math.sin(this.a) * 10 + 4, 0xe8f6ff, 3, { speed: 50, gravity: 120, life: 380, spread: 70 }); }
      if (this.alt < 0.3 && Math.random() < dt * 8) { const wk = this.add.image(this.x - Math.cos(this.a) * 14, this.y - Math.sin(this.a) * 14, 'ocean', 'wake').setDepth(4).setAlpha(0.8); this.tweens.add({ targets: wk, scale: 2.2, alpha: 0, duration: 700, onComplete: () => wk.destroy() }); }
      const sp = this.comp ? this.speed / (game.phenotype(this.comp).stats.flySpeed * 0.62) : 0;
      if (sp > 0.8 && Math.random() < dt * 22 * k0()) {
        const a2 = this.a, px = this.x + (Math.random() - 0.5) * 50, py = this.y + (Math.random() - 0.5) * 50, st = this.add.image(px, py, 'ocean', 'streak').setRotation(a2).setDepth(44).setAlpha(0.6);
        this.tweens.add({ targets: st, x: px - Math.cos(a2) * 70, y: py - Math.sin(a2) * 70, alpha: 0, duration: 300, onComplete: () => st.destroy() });
      }
    } else { this.vessel.setScale(1); this.vessel.setFrame(Math.floor(time / 400) % 2 ? 'boat_1' : 'boat_0'); this.shadow.setVisible(false); }
    this.updateWings(time, dt);
    // swooping low pulls the view toward the waves; top speed darkens the edges
    const cs = settings.flightCam, spK = this.flying && this.comp ? this.speed / (game.phenotype(this.comp).stats.flySpeed * 0.62) : 0;
    const zT = 1 + (this.flying ? (1 - this.alt) * 0.09 * cs : 0);
    cam.setZoom(cam.zoom + (zT - cam.zoom) * Math.min(1, dt * 3));
    if (this.vign) { const va = this.flying ? (Math.max(0, spK - 0.85) * 1.4 + (this.dashT > 0 ? 0.3 : 0)) * cs : 0; this.vign.setDisplaySize(W + 4, GAME_H + 4).setAlpha(this.vign.alpha + (Math.min(0.8, va) - this.vign.alpha) * Math.min(1, dt * 4)); }
    this.lastA = this.a;
    // high clouds: screen-space with parallax > 1 so they slide past faster than the sea (they are closer to the camera)
    const dcx = cam.scrollX - this.lastCam.x, dcy = cam.scrollY - this.lastCam.y; this.lastCam = { x: cam.scrollX, y: cam.scrollY };
    if (Math.abs(dcx) + Math.abs(dcy) < 200) for (const c of this.skyClouds) {
      c.sx -= dcx * c.sf - Math.cos(this.windA) * 6 * dt; c.sy -= dcy * c.sf - Math.sin(this.windA) * 6 * dt;
      const m = 80;
      if (c.sx < -m) c.sx += W + 2 * m; if (c.sx > W + m) c.sx -= W + 2 * m; if (c.sy < -m) c.sy += GAME_H + 2 * m; if (c.sy > GAME_H + m) c.sy -= GAME_H + 2 * m;
      const near = Math.hypot(c.sx - (this.x - cam.scrollX), c.sy - (this.y - cam.scrollY)) < 50 * c.img.scaleX;
      c.img.setPosition(Math.round(c.sx), Math.round(c.sy)).setVisible(this.flying).setAlpha(near ? 0.3 : 0.55 - this.storm * 0.15).setTint(this.storm > 0.4 ? 0x9aa6bc : 0xffffff);
    }
    // wake, wind streaks, current streaks
    const k = particleScale();
    if (!this.flying && this.speed > 14 && Math.random() < dt * 22 * k) { const w = this.add.image(this.x - Math.cos(this.a) * 16, this.y - Math.sin(this.a) * 16, 'ocean', 'wake').setDepth(4).setAlpha(0.7); this.tweens.add({ targets: w, scale: 2.4, alpha: 0, duration: 900, onComplete: () => w.destroy() }); }
    if (Math.random() < dt * (3 + this.storm * 10 + (this.flying ? 6 : 0)) * k) {
      const x = cam.worldView.x + Math.random() * W, y = cam.worldView.y + Math.random() * GAME_H, cu = currentAt(x, y), useWind = this.flying || Math.random() < 0.4;
      const a = useWind ? this.windA : Math.atan2(cu.y, cu.x), s = this.add.image(x, y, 'ocean', 'streak').setRotation(a).setDepth(useWind ? 45 : 3).setAlpha(useWind ? 0.5 : 0.35).setTint(useWind ? 0xffffff : 0xa8e0f0);
      this.tweens.add({ targets: s, x: x + Math.cos(a) * 60, y: y + Math.sin(a) * 60, alpha: 0, duration: 1100, onComplete: () => s.destroy() });
    }
    // drifting cloud shadows wrap around the camera
    for (const c of this.clouds) { c.x += Math.cos(this.windA) * 9 * dt; c.y += Math.sin(this.windA) * 9 * dt; if (c.x < cam.worldView.x - 240) c.x += W + 480; if (c.x > cam.worldView.right + 240) c.x -= W + 480; if (c.y < cam.worldView.y - 200) c.y += GAME_H + 400; if (c.y > cam.worldView.bottom + 200) c.y -= GAME_H + 400; c.setAlpha(0.5 + this.storm * 0.5); }
    // storm
    let n = this.storm * 170 * dt * k; while (n > 0) { if (n >= 1 || Math.random() < n) this.rain.emitParticle(1); n -= 1; }
    if (this.storm > 0.55 && (this.boltT -= dt) <= 0) {
      this.boltT = 2.5 + Math.random() * 5; cam.flash(120, 225, 228, 255); audio.play('thunder', 0.8);
      const bx = this.x + (Math.random() - 0.5) * 260, by = this.y + (Math.random() - 0.5) * 160; this.vfx.play('bolt', bx, by + 20, { scale: 0.8, depth: 50 });
      if (Math.hypot(bx - this.x, by - this.y) < 26) this.hurtVessel(20, bx, by);
    }
    audio.setAmbience({ waves: 0.75, wind: 0.2 + this.storm * 0.5 + (this.flying ? 0.2 : 0), rain: this.storm * 0.7 });
  }
}
