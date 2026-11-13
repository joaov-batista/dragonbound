import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { Projectiles } from '../combat/Projectiles';
import { DEBUG, DEPTH, GAME_H, TILE } from '../core/constants';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { settings } from '../core/settings';
import { FOOD_ITEMS, ITEM_NAMES, game } from '../core/state';
import type { ProjectileSpec, World } from '../core/world';
import { Dragon } from '../dragons/Dragon';
import { updateRide } from '../dragons/Flight';
import type { Element, FoodId } from '../dragons/genetics/types';
import { DragonTextures } from '../dragons/rendering/DragonTextures';
import { Enemy } from '../entities/Enemy';
import { buildInteractables, type Interactable } from '../entities/Interactables';
import { input } from '../input/InputManager';
import { rectsOverlap, type Rect } from '../physics/Body';
import { Liquid, type TileGrid } from '../physics/TileGrid';
import { Player } from '../player/Player';
import { VfxManager } from '../vfx/VfxManager';
import { Backdrop, mulColor } from '../world/Backdrop';
import { siteById } from '../world/generation/archipelago';
import { loadIsland } from '../world/generation/archipelago';
import { IslandView } from '../world/IslandView';
import type { IslandData } from '../world/islands/types';
import { WeatherFx } from '../world/WeatherFx';
import { mix } from '../art/Pix';

export interface IslandEntry { islandId: string; entry: 'load' | 'dock' | 'air-west' | 'air-east' | 'respawn' }

/** Side-view exploration: platforming, combat, taming and mounted flight on one island. */
export class IslandScene extends Phaser.Scene {
  grid!: TileGrid; island!: IslandData; vfx!: VfxManager;
  player!: Player; dragons: Dragon[] = []; enemies: Enemy[] = []; things: Interactable[] = [];
  private view!: IslandView; private backdrop!: Backdrop; private weather!: WeatherFx; private shots!: Projectiles;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private entry!: IslandEntry; private stop = 0; private mount: Dragon | null = null; private focus: Dragon | null = null;
  private buildQueue: Dragon[] = []; private promptT = 0; private saveT = 45; private hatchT = 2; private foodT = 0; private leaving = false;
  private foodCache = new Map<Dragon, { x: number; y: number; thing: Interactable } | null>();
  private comboMark = new Map<Enemy, number>(); private lookX = 0; private fallT = 0; private caveK = 0; private camY = 0;

  constructor() { super('Island'); }
  init(data: IslandEntry): void { this.entry = data; }

  create(): void {
    const site = siteById(game.save.worldSeed, this.entry.islandId) ?? siteById(game.save.worldSeed, 'alvamar')!;
    this.island = loadIsland(site); this.grid = this.island.grid;
    game.populate(this.island);
    game.save.player.island = this.island.id;
    if (!game.save.ocean.discovered.includes(this.island.id)) game.save.ocean.discovered.push(this.island.id);
    this.dragons = []; this.enemies = []; this.things = []; this.buildQueue = []; this.mount = null; this.focus = null; this.leaving = false; this.foodCache.clear(); this.comboMark.clear();

    const W = this.worldRef;
    this.vfx = new VfxManager(this);
    this.backdrop = new Backdrop(this, this.island.biome, this.island.seaRow * TILE);
    this.view = new IslandView(this, this.island);
    this.weather = new WeatherFx(this, this.island.weather, this.island.biome);
    this.shots = new Projectiles(W);
    this.tintRect = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint).setBlendMode(Phaser.BlendModes.MULTIPLY);

    // where does the player arrive?
    const p = game.save.player, dock = this.island.spawns.find((s) => s.t === 'dock');
    let px = this.island.start.x, py = this.island.start.y;
    if (this.entry.entry === 'load' && p.x >= 0) { px = p.x; py = p.y; }
    else if (this.entry.entry === 'respawn' && p.checkpoint.island === this.island.id && p.checkpoint.x >= 0) { px = p.checkpoint.x; py = p.checkpoint.y; }
    else if (this.entry.entry === 'dock' && dock) { px = dock.x; py = dock.y; }
    else if (this.entry.entry === 'air-west') { px = 150; py = (this.island.seaRow - 13) * TILE; }
    else if (this.entry.entry === 'air-east') { px = this.grid.pxW - 150; py = (this.island.seaRow - 13) * TILE; }
    if (p.checkpoint.x < 0) p.checkpoint = { island: this.island.id, x: px, y: py };
    this.player = new Player(W, px, py);

    this.things = buildInteractables({ world: W, view: this.view, sail: () => this.sail(), rest: (x, y) => this.rest(x, y), nest: (x, y) => this.useNest(x, y) }, this.island.spawns);
    for (const s of this.island.spawns) if (s.t === 'enemy') this.enemies.push(new Enemy(W, s.kind, s.x, s.y));

    // companion travels with the player; everyone else lives where they were left
    const comp = game.companion;
    if (comp && comp.island !== this.island.id) { comp.island = this.island.id; comp.homeX = px; comp.homeY = py; }
    if (comp && (this.entry.entry !== 'load')) { comp.x = px - 30; comp.y = py; }
    for (const rec of game.dragonsOn(this.island.id)) this.addDragon(rec);
    for (const e of game.save.eggs) if (e.island === this.island.id) this.add.image(e.x, e.y - 2, 'props', 'egg').setOrigin(0.5, 1).setDepth(DEPTH.entities).setName('egg-' + e.id);

    const cam = this.cameras.main;
    cam.setBounds(0, -400, this.grid.pxW, this.grid.pxH + 400).setRoundPixels(true);
    cam.centerOn(px, py - 40); this.camY = py - 40;
    cam.fadeIn(500, 8, 6, 16);

    if (this.entry.entry.startsWith('air') && comp) {
      const d = this.dragons.find((x) => x.rec === comp);
      if (d) { d.build(); d.body.x = px; d.body.y = py; d.facing = this.entry.entry === 'air-west' ? 1 : -1; d.body.vx = d.facing * 120; this.doMount(d, true); d.air = true; d.flight.airborne = true; }
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.shots.clear(); DragonTextures.dispose(this); input.clearVirtual(); });
    events.emit('areaTitle', { title: this.island.name, subtitle: this.island.subtitle });
    hud.mode = this.mount ? 'flight' : 'ground'; hud.prompt = null; hud.dialog = null;
    this.applyAmbience(0);
    if (DEBUG) (window as unknown as Record<string, unknown>).__scene = this;
  }

  /** `World.scene` for entities (Phaser reserves `this.scene` for the scene plugin). */
  private wref: World | null = null;
  private get worldRef(): World {
    if (this.wref) return this.wref;
    const self = this;
    return this.wref = {
      scene: self as Phaser.Scene, get grid() { return self.grid; }, get island() { return self.island; }, get vfx() { return self.vfx; },
      hitstop: (s) => self.hitstop(s), shake: (i, ms) => self.shake(i, ms), spawnProjectile: (p) => self.spawnProjectile(p),
      strike: (r, d, e, f, x, s, ex) => self.strike(r, d, e, f, x, s, ex), windAt: (x, y) => self.windAt(x, y),
    };
  }

  private addDragon(rec: (typeof game.save.dragons)[string]): Dragon {
    const d = new Dragon(this.worldRef, rec);
    this.dragons.push(d); this.buildQueue.push(d);
    return d;
  }

  hitstop(s: number): void { this.stop = Math.max(this.stop, s); }
  shake(i: number, ms = 120): void { if (settings.screenShake > 0) this.cameras.main.shake(ms, 0.0025 * i * settings.screenShake); }
  spawnProjectile(p: ProjectileSpec): void { this.shots.spawn(p); }
  windAt(x: number, y: number): { x: number; y: number } {
    let wx = 0, wy = 0;
    for (const z of this.island.winds) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { wx += z.vx; wy += z.vy; }
    return { x: wx, y: wy };
  }

  strike(rect: Rect, dmg: number, element: Element | 'physical', friendly: boolean, fromX: number, source: 'player' | 'dragon' | 'enemy', exclude?: unknown): number {
    let n = 0;
    const hits = (b: { x: number; y: number; w: number; h: number }): boolean => rectsOverlap(rect, { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h });
    if (friendly) {
      for (const e of this.enemies) if (e.alive && hits(e.body)) {
        let d = dmg;
        const mark = this.comboMark.get(e) ?? -9;
        if (source === 'player' && this.time.now - mark < 1400) { d *= 2; this.vfx.play('crit', e.body.x, e.body.y, { scale: 0.8 }); events.emit('toast', { text: 'Ataque combinado!', icon: 'star' }); this.comboMark.delete(e); }
        if (e.hurt(d, fromX, element, source, source === 'player' ? this.player.attackId : undefined)) { n++; if (source === 'dragon') this.comboMark.set(e, this.time.now); if (!e.alive) this.onEnemyDead(e); }
      }
      if (source === 'player') for (const d of this.dragons) if (d !== exclude && d.ready && !d.ridden && !d.far && (!d.rec.bonded || d.rec.trapped) && hits(d.body)) {
        if (this.hitOnce(d)) { d.hurt(dmg, fromX, element, 'player'); n++; }
      }
    } else {
      const pl = this.player;
      if (pl.alive && hits(pl.body) && !this.mount) { if (this.damagePlayer(1 + (dmg > 2 ? 1 : 0), fromX)) n++; }
      for (const d of this.dragons) if (d !== exclude && d.rec.bonded && d.ready && hits(d.body)) { d.hurt(dmg * 0.5, fromX, element, source === 'enemy' ? 'enemy' : 'dragon'); n++; }
    }
    return n;
  }
  private hitIds = new Map<Dragon, number>();
  private hitOnce(d: Dragon): boolean { if (this.hitIds.get(d) === this.player.attackId) return false; this.hitIds.set(d, this.player.attackId); return true; }

  private damagePlayer(dmg: number, fromX: number, by?: Enemy): boolean {
    const pl = this.player;
    if (pl.parrying && by) { pl.hurt(dmg, fromX); by.stagger(); events.emit('toast', { text: 'Aparou!' }); return false; }
    const hit = pl.hurt(dmg, fromX);
    if (hit && this.mount && pl.hp > 0) { this.mount.vocalize('roar', pl.body.x); }
    return hit;
  }
  private onEnemyDead(e: Enemy): void {
    if (e.drop && Math.random() < 0.7) { game.addItem(e.drop); events.emit('toast', { text: `+1 ${ITEM_NAMES[e.drop]}`, icon: e.drop }); }
    this.hitstop(0.07);
  }

  // ── interactions ────────────────────────────────────────────────────────
  private doMount(d: Dragon, silent = false): void {
    this.mount = d; d.ridden = true; d.air = false; d.flight.sx = d.flight.sy = 0;
    this.player.mount(); this.player.sprite.setDepth(DEPTH.entities + 3);
    hud.mode = 'flight'; events.emit('modeChanged', 'flight');
    if (!silent) { audio.play('ui'); d.vocalize('chirp', d.body.x); this.vfx.puff(d.body.x, d.body.y, 0xffffff, 6); game.save.stats.flights++; d.mind.bond.rec.training = Math.min(100, d.rec.training + 0.5); }
  }
  private doDismount(): void {
    const d = this.mount; if (!d) return;
    this.mount = null; d.ridden = false; d.sprite.setRotation(0);
    this.player.sprite.setDepth(DEPTH.player).setVisible(true);
    this.player.dismount(d.body.x - d.facing * 4, d.body.y - (d.air ? 30 : 2), d.air ? -210 : -120);
    d.mind.force('follow', 0.5); d.rec.follow = true;
    hud.mode = 'ground'; events.emit('modeChanged', 'ground'); audio.setWindBoost(0);
  }

  private tryMount(): void {
    if (this.mount) { this.doDismount(); return; }
    const pl = this.player; let best: Dragon | null = null, bd = 70;
    for (const d of this.dragons) if (d.rec.bonded && d.ready) { const dist = Math.hypot(d.body.x - pl.body.x, d.body.y - pl.body.y); if (dist < bd) { bd = dist; best = d; } }
    if (!best) { if (game.bondedList().length) events.emit('toast', { text: 'Seu dragão está longe. Assobie para chamá-lo.' }); return; }
    if (!game.canRide(best.rec)) { events.emit('toast', { text: game.stage(best.rec) !== 'adult' ? `${best.rec.name} ainda é jovem demais para ser montado.` : best.rec.hp <= 0 ? `${best.rec.name} está ferido.` : `${best.rec.name} é pequeno demais para carregar você.` }); audio.play('deny'); return; }
    if (!best.mind.bond.obeys('mount', Math.random())) { events.emit('toast', { text: `${best.rec.name} se esquiva — hoje não está com vontade.` }); best.mind.force('play', 1.5); audio.play('deny'); return; }
    this.doMount(best);
  }

  private whistle(): void {
    const pl = this.player, day = game.day;
    for (const d of this.dragons) if (d.ready && !d.far && Math.abs(d.body.x - pl.body.x) < 320) d.mind.bond.whistle(day);
    const comp = this.dragons.find((d) => d.rec === game.companion);
    if (!comp || comp.ridden) return;
    const dist = Math.hypot(comp.body.x - pl.body.x, comp.body.y - pl.body.y);
    // mid-air rescue: a loyal mount dives under a falling rider
    if (!pl.body.onGround && this.fallT > 0.35 && game.canRide(comp.rec) && comp.mind.bond.obeys('come', Math.random() * 0.6)) {
      comp.body.x = pl.body.x; comp.body.y = pl.body.y + 26; comp.body.vx = pl.body.vx; comp.body.vy = 60; comp.air = true;
      this.vfx.play('collect', pl.body.x, pl.body.y + 20); this.doMount(comp); comp.air = true; comp.flight.airborne = true;
      events.emit('toast', { text: `${comp.rec.name} mergulhou para te resgatar!`, icon: 'wing' }); return;
    }
    if (dist < 80 && pl.body.onGround) { comp.rec.follow = !comp.rec.follow; comp.mind.force(comp.rec.follow ? 'follow' : 'stay', 0.5); events.emit('toast', { text: comp.rec.follow ? `${comp.rec.name}: seguir` : `${comp.rec.name}: esperar aqui` }); }
    else if (comp.mind.bond.obeys('come', Math.random())) { comp.rec.follow = true; comp.mind.force('follow', 1); comp.vocalize('chirp', pl.body.x); if (dist > 700) { comp.body.x = pl.body.x - pl.facing * 120; comp.body.y = pl.body.y - 80; comp.air = true; } }
    else events.emit('toast', { text: `${comp.rec.name} ouviu, mas está distraído.` });
  }

  private commandAttack(): void {
    const comp = this.dragons.find((d) => d.rec === game.companion && !d.ridden && d.ready);
    if (!comp) return;
    let tgt: Enemy | null = null, bd = 240;
    for (const e of this.enemies) if (e.alive) { const d = Math.hypot(e.body.x - this.player.body.x, e.body.y - this.player.body.y); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) { events.emit('toast', { text: 'Nenhum alvo por perto.' }); return; }
    if (comp.mind.bond.obeys('attack', Math.random())) { tgt.aggro = true; comp.mind.provoke(1.2); comp.mind.force('protect', 0.6); comp.vocalize('roar', comp.body.x); this.vfx.play('exclaim', tgt.body.x, tgt.body.y - 20, { scale: 0.6 }); }
    else { events.emit('toast', { text: `${comp.rec.name} hesita.` }); audio.play('deny'); }
  }

  private useItem(): void {
    const pl = this.player, p = game.save.player, id = p.selected;
    if ((p.items[id] ?? 0) <= 0) { game.cycleItem(1); return; }
    if (id === 'shell') {
      let any = false;
      for (const d of this.dragons) if (d.ready && !d.far && Math.abs(d.body.x - pl.body.x) < 150) { if (d.ph.likes.includes('shiny') || d.ph.likes.includes('play')) { d.mind.bond.played(game.day); any = true; } }
      pl.setPose('offer', 0.8); this.vfx.puff(pl.body.x + pl.facing * 12, pl.body.y - 16, 0xfff0c0, 5, { add: true, gravity: 0 });
      events.emit('toast', { text: any ? 'O brilho da concha chamou a atenção!' : 'Você mostra a concha brilhante.' });
      return;
    }
    if (p.hp < p.maxHp && FOOD_ITEMS.includes(id) && id !== 'ember' && !this.focus) {
      if (game.useItem(id)) { p.hp = Math.min(p.maxHp, p.hp + (id === 'herb' ? 2 : 1)); events.emit('hudDirty'); audio.play('eat'); this.vfx.play('heal', pl.body.x, pl.body.y, { follow: pl.body, scale: 0.8 }); }
    }
  }

  private rest(x: number, y: number): void {
    const p = game.save.player;
    p.hp = p.maxHp; p.checkpoint = { island: this.island.id, x, y: y }; events.emit('hudDirty');
    for (const d of this.dragons) if (d.rec.bonded && !d.far) { d.rec.energy = Math.min(1, d.rec.energy + 0.4); d.rec.hp = Math.min(d.ph.stats.maxHp, d.rec.hp + d.ph.stats.maxHp * 0.5); }
    this.vfx.play('heal', this.player.body.x, this.player.body.y); audio.play('bond', 0.5);
    this.saveNow('Progresso salvo. Você descansou junto ao fogo.');
  }
  private saveNow(msg?: string): void {
    const p = game.save.player, b = this.mount ? this.mount.body : this.player.body;
    p.x = b.x; p.y = b.y; game.save.ocean.atSea = false;
    game.persist().then(() => { if (msg) events.emit('toast', { text: msg }); }).catch((e: Error) => events.emit('toast', { text: e.message }));
  }
  private useNest(x: number, y: number): void {
    const here = this.dragons.filter((d) => d.rec.bonded && game.stage(d.rec) === 'adult' && Math.abs(d.body.x - x) < 400);
    for (const a of here) for (const b of here) if (a !== b && a.rec.genes.species === b.rec.genes.species && a.rec.genes.sex !== b.rec.genes.sex) {
      if (game.save.eggs.some((e) => e.island === this.island.id)) { events.emit('dialog', { text: 'Já há um ovo neste ninho. Dê tempo ao tempo.' }); return; }
      game.layEgg(a.rec, b.rec, this.island.id, x, y - 4);
      const e = game.save.eggs[game.save.eggs.length - 1];
      this.add.image(x, y - 6, 'props', 'egg').setOrigin(0.5, 1).setDepth(DEPTH.entities).setName('egg-' + e.id);
      this.vfx.play('blessing', x, y, {}); audio.play('bond');
      events.emit('dialog', { text: `${a.rec.name} e ${b.rec.name} deixaram um ovo no ninho! Ele deve chocar em cerca de meio dia.` });
      return;
    }
    events.emit('dialog', { text: 'Um ninho antigo. Dois dragões vinculados, adultos, da mesma espécie e de sexos opostos poderiam usá-lo.' });
  }
  private sail(): void { this.leave('boat'); }
  private leave(how: 'boat' | 'fly-west' | 'fly-east'): void {
    if (this.leaving) return; this.leaving = true;
    const site = siteById(game.save.worldSeed, this.island.id)!, o = game.save.ocean;
    const comp = game.companion;
    o.atSea = true; o.flying = how !== 'boat';
    o.x = site.x + (how === 'fly-east' ? site.r * 1.25 + 60 : -(site.r * 1.25 + 60)); o.y = site.y + (how === 'boat' ? 30 : 0);
    if (comp) { comp.island = this.island.id; }
    game.save.player.x = -1;
    void game.persist().catch(() => undefined);
    this.cameras.main.fadeOut(400, 8, 6, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Ocean', { from: this.island.id, heading: how === 'fly-east' ? 0 : Math.PI }));
  }

  private applyAmbience(caveK: number): void {
    const b = this.island.biome, n = game.night ? 1 : 0, pl = this.player.body;
    const nearSea = Math.max(0, 1 - Math.abs(pl.y - this.island.seaRow * TILE) / 260) * (1 - caveK);
    audio.setAmbience({
      waves: 0.25 + nearSea * 0.5, wind: (b === 'storm' ? 0.55 : 0.12) * (1 - caveK * 0.8) + (this.mount?.air ? 0.3 : 0),
      rain: this.weather.intensity * (1 - caveK * 0.7) * 0.7, cave: caveK * 0.8, lava: b === 'volcanic' ? 0.35 : 0,
      birds: b === 'tropical' && !n ? 0.8 * (1 - caveK) : 0, night: n && b !== 'storm' ? 0.7 * (1 - caveK) : 0,
    });
    const fight = this.enemies.some((e) => e.alive && e.aggro);
    audio.setMusic(fight ? 'tense' : b === 'storm' ? 'storm' : 'calm');
  }

  // ── main loop ───────────────────────────────────────────────────────────
  override update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    hud.fps = this.game.loop.actualFps; hud.entities = this.dragons.length + this.enemies.length; hud.fxCount = this.vfx.activeCount;
    input.update();
    audio.update(dt, game.daylight);
    if (hud.inMenu || this.leaving) { this.renderOnly(time, dt); return; }
    if (hud.dialog) { if (input.pressed('interact') || input.pressed('jump') || input.pressed('attack') || input.pressed('pause')) { hud.dialog = null; events.emit('dialog', null); audio.play('uiBack'); } this.renderOnly(time, dt); return; }
    if (input.pressed('pause')) { events.emit('openMenu', undefined); return; }
    if (input.pressed('map')) { events.emit('openMenu', { tab: 'map' }); return; }
    if (this.stop > 0) { this.stop -= dt; this.vfx.update(); return; }
    game.tick(dt);

    const pl = this.player, pb = pl.body;
    // build at most one DNA texture per frame, nearest first
    if (this.buildQueue.length) {
      let bi = -1, bd = 900;
      this.buildQueue.forEach((d, i) => { const dist = Math.abs(d.body.x - pb.x); if (dist < bd) { bd = dist; bi = i; } });
      if (bi >= 0) this.buildQueue.splice(bi, 1)[0].build();
    }

    // player / mount
    if (this.mount) {
      if (input.pressed('mount')) this.doDismount();
      else { updateRide(this.mount, pl, this.worldRef, dt, this.island.weather === 'storm'); hud.stamina = this.mount.flight.stamina; hud.staminaMax = this.mount.ph.stats.stamina; }
      pl.update(dt);
      const mb = this.mount?.body;
      if (mb && this.mount!.air && (mb.x < 26 || mb.x > this.grid.pxW - 26)) { this.leave(mb.x < 100 ? 'fly-west' : 'fly-east'); return; }
    } else {
      pl.update(dt);
      this.fallT = !pb.onGround && pb.vy > 200 ? this.fallT + dt : 0;
      if (input.pressed('mount')) this.tryMount();
      if (pl.whistled) this.whistle();
      if (input.pressed('ability')) this.commandAttack();
      if (input.pressed('itemNext')) { game.cycleItem(1); audio.play('ui'); }
      if (input.pressed('item')) this.useItem();
      if (pl.attackRect) this.strike(pl.attackRect, pl.attackDmg, 'physical', true, pb.x, 'player');
    }
    // offering food: hold the item button while facing a dragon
    const sel = game.save.player.selected;
    pl.offering = !this.mount && input.down('item') && pb.onGround && FOOD_ITEMS.includes(sel) && (game.save.player.items[sel] ?? 0) > 0 && this.focus && !pl.busy ? (sel as FoodId) : null;
    if (pl.offering) pl.setPose('offer', 0.15);

    // enemies
    for (const e of this.enemies) {
      const r = e.update(dt, pb.x, pb.y, pl.alive);
      if (r.contact) this.damagePlayer(1, e.body.x, e);
      if (r.shoot) { const c = e.center, d = Math.hypot(pb.x - c.x, pb.y - 12 - c.y) || 1; this.shots.spawn({ x: c.x, y: c.y, vx: ((pb.x - c.x) / d) * 150, vy: ((pb.y - 12 - c.y) / d) * 150, dmg: 1, element: 'storm', friendly: false, fx: 'sparkarc', life: 1.6, scale: 0.35 }); audio.play('zap', 0.5); }
    }
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);

    // projectiles
    this.shots.update(dt, (p, x, y) => {
      const r = p.radius ?? 8, rect = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
      return this.strike(rect, p.dmg, p.element, p.friendly, x - Math.sign(p.vx), p.friendly ? 'dragon' : 'enemy', p.owner) > 0;
    });

    this.updateDragons(dt);
    this.updateThings(dt);
    this.updateWorldFx(time, dt);
    this.updateCamera(dt);

    // death → respawn at the last campfire
    if (pl.deadDone && !this.leaving) {
      this.leaving = true; if (this.mount) this.doDismount();
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => { game.save.player.hp = game.save.player.maxHp; const cp = game.save.player.checkpoint; this.scene.start('Island', { islandId: cp.island, entry: 'respawn' } satisfies IslandEntry); });
    }
    if ((this.saveT -= dt) <= 0 && pb.onGround && !this.enemies.some((e) => e.aggro)) { this.saveT = 60; this.saveNow(); }
    if ((this.hatchT -= dt) <= 0) {
      this.hatchT = 3;
      for (const rec of game.hatchDue(this.island.id)) {
        this.children.getByName('egg-' + [...this.children.list].find((c) => c.name.startsWith('egg-'))?.name.slice(4))?.destroy();
        const d = this.addDragon(rec); this.vfx.play('blessing', rec.x, rec.y); audio.play('bond', 0.7); d.vocalize('chirp', rec.x);
        events.emit('toast', { text: `Um ovo chocou! Nasceu ${rec.name}, um filhote único.`, icon: 'paw' });
      }
    }
    this.vfx.update();
  }

  private renderOnly(time: number, dt: number): void { this.updateWorldFx(time, dt * 0.2); }

  private updateDragons(dt: number): void {
    const pl = this.player, pb = pl.body, day = game.day, storm = this.island.weather === 'storm';
    let focus: Dragon | null = null, fd = 180;
    if ((this.foodT -= dt) <= 0) { this.foodT = 1; this.foodCache.clear(); }
    const aggro = this.enemies.filter((e) => e.alive && e.aggro);
    for (const d of this.dragons) {
      const b = d.body, dist = Math.hypot(pb.x - b.x, pb.y - b.y);
      // threats
      let threat: { x: number; y: number; dist: number } | null = null;
      for (const e of aggro) { const de = Math.hypot(e.body.x - b.x, e.body.y - b.y); const rel = d.rec.bonded ? Math.min(de, Math.hypot(e.body.x - pb.x, e.body.y - pb.y) + 40) : de; if (rel < (d.rec.bonded ? 230 : 80) && (!threat || de < threat.dist)) threat = { x: e.body.x, y: e.body.y, dist: de }; }
      // natural food (cached per second)
      let food = this.foodCache.get(d);
      if (food === undefined && !d.far) {
        food = null; let bd = 320;
        if (d.rec.hunger > 0.45) for (const t of this.things) { const f = t.food?.(); if (!f || f === d.ph.dislikedFood) continue; const dd = Math.hypot(t.x - b.x, t.y - b.y); if (dd < bd && Math.abs(t.x - d.rec.homeX) < d.rec.homeR * 1.6) { bd = dd; food = { x: t.x, y: t.y, thing: t }; } }
        this.foodCache.set(d, food);
      }
      let other: { x: number; y: number; dist: number; bondedWithPlayer: boolean } | null = null;
      for (const o of this.dragons) if (o !== d && !o.far) { const dd = Math.hypot(o.body.x - b.x, o.body.y - b.y); if (dd < 170 && (!other || dd < other.dist)) other = { x: o.body.x, y: o.body.y, dist: dd, bondedWithPlayer: o.rec.bonded }; }
      const visible = dist < 300 && (dist < 60 || this.grid.los(b.x, b.y - b.h * 0.6, pb.x, pb.y - 12));
      d.update(dt, {
        day, night: game.night, storm,
        player: { x: pb.x, y: pb.y, dist, motion: this.mount ? 'walk' : pl.motion, visible, offering: pl.offering, gesturing: pl.gesturing, mounted: !!this.mount, threatened: pl.hurtRecently > 0 || aggro.length > 0, alive: pl.alive },
        threat, food: food ? { x: food.x, y: food.y, dist: Math.hypot(food.x - b.x, food.y - b.y) } : null, other,
      });
      if (d.far || !d.ready) continue;
      const it = d.intent;
      if (it?.ateWorldFood && food) { food.thing.eaten?.(); this.foodCache.delete(d); }
      if (it?.tookOffer && pl.offering) { const item = pl.offering; if (game.useItem(item)) d.mind.bond.feed(item, day); pl.offering = null; if ((game.save.player.items[item] ?? 0) <= 0) game.cycleItem(1); }
      if (pl.sudden && dist < 150 && visible && !this.mount) d.mind.bond.suddenMove(day, dist < 70 ? 1.3 : 0.8);
      // hostile strikes are resolved through world.strike (see Dragon.strike)
      d.feedback();
      if (!d.rec.bonded && d.rec.fear > 60 && it?.state !== 'flee' && it?.state !== 'attack' && it?.state !== 'defend' && it?.state !== 'trapped') d.mind.force('startled', 0.35);
      if (!d.ridden && dist < fd && (visible || d.rec.bonded)) { fd = dist; focus = d; }
      // bonding ritual: stay still and hold Interact while the dragon lowers its head
      if (it?.state === 'bonding') {
        if (input.down('interact') && pl.holdStill > 0.2 && dist < 70) { d.mind.bondHold += dt; pl.setPose('offer', 0.15); pl.facing = Math.sign(b.x - pb.x) || 1; if (Math.random() < dt * 8) this.vfx.puff(b.x + d.facing * 20 * d.scale, b.y - 24 * d.scale, 0x7fe8d0, 1, { add: true, gravity: -40, speed: 14 }); }
        else d.mind.bondHold = Math.max(0, d.mind.bondHold - dt * 2);
        hud.bondHold = d.mind.bondHold / 2.5;
        if (d.mind.bondHold >= 2.5) this.completeBond(d);
      } else if (this.focus === d) hud.bondHold = 0;
    }
    this.focus = focus; hud.focusId = focus?.rec.genes.id ?? null;
    if (this.mount) { this.mount.rec.x = this.mount.body.x; }
  }

  private completeBond(d: Dragon): void {
    d.mind.bond.completeBond(game.day); d.mind.bondHold = 0; d.mind.force('play', 3); hud.bondHold = 0;
    const first = game.save.stats.bonded === 0;
    game.save.stats.bonded++;
    if (!game.save.companion) game.save.companion = d.rec.genes.id;
    this.vfx.play('levelup', d.body.x, d.body.y, {}); this.vfx.play('blessing', this.player.body.x, this.player.body.y, {});
    audio.play('bond'); d.vocalize('purr', d.body.x); this.hitstop(0.12); this.cameras.main.flash(300, 160, 255, 230);
    events.emit('bonded', { id: d.rec.genes.id });
    events.emit('dialog', { text: `Vínculo formado! ${d.rec.name} agora confia em você.${game.canRide(d.rec) ? ' Aproxime-se e use Montar para voar.' : ' Ele vai te seguir e proteger.'}${first ? ' Assobie para chamar; perto dele, o assobio alterna entre seguir e esperar.' : ''}` });
    this.saveNow();
  }

  private updateThings(dt: number): void {
    const pl = this.player, pb = pl.body;
    let best: Interactable | null = null, bd = 999;
    for (const t of this.things) {
      t.update?.(dt);
      if (!t.range) continue;
      const d = Math.hypot(t.x - pb.x, t.y - (pb.y - 10));
      if (t.auto) { if (d < t.range + 6 && !this.mount) t.use(); continue; }
      if (d < t.range && d < bd && t.prompt()) { bd = d; best = t; }
    }
    if ((this.promptT -= dt) > 0 && !input.pressed('interact')) return;
    this.promptT = 0.1;
    let text: string | null = null, action = 'interact';
    const f = this.focus, fdist = f ? Math.hypot(f.body.x - pb.x, f.body.y - pb.y) : 999;
    if (this.mount) { text = this.mount.air ? null : 'Desmontar'; action = 'mount'; if (!this.mount.air && this.mount.body.onGround && Math.abs(this.mount.body.vx) < 20) text = 'Desmontar  ·  Pular para decolar'; }
    else if (f && f.intent?.state === 'bonding') text = 'Fique imóvel e segure para criar o vínculo';
    else if (best) text = best.prompt();
    else if (f && fdist < 46 && !f.rec.trapped) text = f.rec.bonded ? `Acariciar ${f.rec.name}` : 'Estender a mão';
    else if (f && f.rec.trapped && fdist < 70) { text = 'Corte a rede com um ataque'; action = 'attack'; }
    else if (f && f.rec.bonded && fdist < 70 && game.canRide(f.rec)) { text = `Montar ${f.rec.name}`; action = 'mount'; }
    hud.prompt = text; hud.promptAction = action;
    if (input.pressed('interact') && !this.mount && !pl.busy) {
      if (f && f.intent?.state === 'bonding') return;
      if (best) { best.use(); return; }
      if (f && fdist < 46 && !f.rec.trapped) { pl.setPose('pet', 0.7); pl.facing = Math.sign(f.body.x - pb.x) || 1; const ev = f.mind.bond.pet(game.day); if (ev?.kind === 'pet') { f.mind.force('approach', 0.8); f.vocalize('purr', pb.x); audio.play('ui'); } else if (ev) { f.mind.force('startled', 0.4); } }
    }
  }

  private updateWorldFx(time: number, dt: number): void {
    const cam = this.cameras.main, pl = this.player.body, W = this.scale.width;
    // am I under a roof? (background wall tile behind the player)
    const tx = Math.floor(pl.x / TILE), ty = Math.floor((pl.y - 12) / TILE);
    const inside = this.grid.inb(tx, ty) && this.grid.bg[ty * this.grid.w + tx] !== 0;
    this.caveK += ((inside ? 1 : 0) - this.caveK) * Math.min(1, dt * 2.5);
    const light = game.daylight, night = 1 - light;
    const wx = this.island.weather;
    let tint = mix(0x56609c, 0xffffff, Math.min(1, light * 1.15));
    if (light > 0.15 && light < 0.5) tint = mix(tint, 0xffb080, 0.35 * (1 - Math.abs(light - 0.32) / 0.18));
    tint = mulColor(tint, wx === 'storm' ? 0xa4aec8 : wx === 'rain' ? 0xc4cce0 : wx === 'ash' ? 0xf4d0b8 : 0xffffff);
    const sky = tint;
    tint = mix(tint, 0x5a5878, this.caveK * 0.7);
    this.tintRect.setSize(W + 4, GAME_H + 4).setFillStyle(tint);
    this.backdrop.update(dt, cam, sky);
    this.view.update(time, dt, cam, Math.max(night, this.caveK));
    const strike = this.weather.update(dt, night, this.caveK > 0.5,
      () => { const x = cam.worldView.x + Math.random() * cam.worldView.width, top = this.grid.groundBelow(x, 0, 200); return top !== null && top < this.island.seaRow * TILE - 60 ? { x, y: top } : null; },
      (x, y) => this.vfx.play('sparkarc', x, y, { scale: 0.7 }));
    if (strike) {
      this.vfx.play('bolt', strike.x, strike.y, {}); this.shake(5, 200);
      this.strike({ x: strike.x - 24, y: strike.y - 60, w: 48, h: 70 }, 2, 'storm', false, strike.x, 'enemy');
    }
    // wind streaks inside gust zones near the camera
    for (const z of this.island.winds) if (z.x < cam.worldView.right && z.x + z.w > cam.worldView.x && Math.random() < dt * 14) {
      const x = z.x + Math.random() * z.w, y = z.y + Math.random() * z.h;
      if (!this.grid.solidPx(x, y)) { const s = this.add.image(x, y, 'ocean', 'streak').setDepth(DEPTH.weather).setAlpha(0.5).setRotation(Math.atan2(z.vy, z.vx || 0.001)); this.tweens.add({ targets: s, x: x + z.vx * 0.5, y: y + z.vy * 0.5, alpha: 0, duration: 500, onComplete: () => s.destroy() }); }
    }
    if (Math.floor(time / 500) !== Math.floor((time - dt * 1000) / 500)) this.applyAmbience(this.caveK);
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main, b = this.mount ? this.mount.body : this.player.body, W = this.scale.width;
    const ahead = this.mount?.air ? Phaser.Math.Clamp(b.vx * 0.42, -110, 110) : this.player.facing * 22;
    this.lookX += (ahead - this.lookX) * Math.min(1, dt * 2.5);
    const ty = b.y - (this.mount?.air ? 30 + Phaser.Math.Clamp(-b.vy * 0.15, -40, 40) : 46);
    this.camY += (ty - this.camY) * Math.min(1, dt * (this.mount ? 5 : b.onGround ? 6 : 3.5));
    if (Math.abs(ty - this.camY) > 70) this.camY = ty - Math.sign(ty - this.camY) * 70;
    cam.scrollX += (b.x + this.lookX - W / 2 - cam.scrollX) * Math.min(1, dt * 8);
    cam.scrollY = this.camY - GAME_H / 2 + 20;
    if (this.grid.liquidAt(b.x, b.y - 30) === Liquid.Water && !this.mount) this.tintRect.setFillStyle(mulColor(this.tintRect.fillColor, 0xa8d8f0));
  }
}
