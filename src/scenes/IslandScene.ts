import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { Projectiles } from '../combat/Projectiles';
import { DEBUG, DEPTH, GAME_H, TILE } from '../core/constants';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { settings } from '../core/settings';
import { FOOD_ITEMS, ITEM_NAMES, game } from '../core/state';
import type { ProjectileSpec, World, StrikeOpts } from '../core/world';
import { EL_COLOR, cancelCharge } from '../dragons/DragonCombat';
import { SkyRaider, Warship } from '../entities/AirForce';
import { Dragon } from '../dragons/Dragon';
import { ceilingY, updateRide } from '../dragons/Flight';
import type { Element, FoodId } from '../dragons/genetics/types';
import { DragonTextures } from '../dragons/rendering/DragonTextures';
import { Enemy, type EnemyLike } from '../entities/Enemy';
import { AlphaBoss, BrutoBoss, type BossHooks } from '../entities/Boss';
import { Npc } from '../entities/Npc';
import { flag, setFlag, updateQuests } from '../story/story';
import { buildInteractables, type Interactable } from '../entities/Interactables';
import { input } from '../input/InputManager';
import { keyLabel } from '../input/actions';
import { rectsOverlap, type Rect } from '../physics/Body';
import { Cell, Liquid, type TileGrid } from '../physics/TileGrid';
import { Player } from '../player/Player';
import { VfxManager } from '../vfx/VfxManager';
import { Backdrop, mulColor } from '../world/Backdrop';
import { siteById } from '../world/generation/archipelago';
import { loadIsland } from '../world/generation/archipelago';
import { IslandView } from '../world/IslandView';
import type { IslandData } from '../world/islands/types';
import { LANE_NAMES, laneList } from '../world/islands/lanes';
import { WeatherFx } from '../world/WeatherFx';
import { mix } from '../art/Pix';
import { THEMES } from '../art/themes';

export interface IslandEntry { islandId: string; entry: 'load' | 'dock' | 'air-west' | 'air-east' | 'respawn' }

/**
 * One depth lane of the island: its own terrain, entities and camera. All lanes share world coordinates
 * (same geography); each is drawn by its own camera whose zoom encodes depth relative to the active lane.
 */
interface Lane {
  depth: number; data: IslandData; world: World; view: IslandView; vfx: VfxManager; shots: Projectiles;
  dragons: Dragon[]; enemies: EnemyLike[]; things: Interactable[]; npcs: Npc[]; triggers: { flag: string; x0: number; x1: number }[];
  cam: Phaser.Cameras.Scene2D.Camera; haze: Phaser.GameObjects.Rectangle; cm: Phaser.Filters.ColorMatrix;
}

/** Side-view exploration: platforming, combat, taming and mounted flight on one island, across depth lanes. */
export class IslandScene extends Phaser.Scene {
  island!: IslandData; player!: Player;
  lanes: Lane[] = []; lane!: Lane;
  get grid(): TileGrid { return this.lane.data.grid; }
  get vfx(): VfxManager { return this.lane.vfx; }
  get dragons(): Dragon[] { return this.lane.dragons; }
  get enemies(): EnemyLike[] { return this.lane.enemies; }
  set enemies(v: EnemyLike[]) { this.lane.enemies = v; }
  get things(): Interactable[] { return this.lane.things; }
  private get shots(): Projectiles { return this.lane.shots; }
  private backdrop!: Backdrop; private weather!: WeatherFx;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private skyCam!: Phaser.Cameras.Scene2D.Camera; private overlayCam!: Phaser.Cameras.Scene2D.Camera;
  private camAll = 0; private tagCam: Phaser.Cameras.Scene2D.Camera | null = null; private laneT = 0; private laneCheckT = 0;
  private entry!: IslandEntry; private stop = 0; private mount: Dragon | null = null; private focus: Dragon | null = null;
  private buildQueue: Dragon[] = []; private promptT = 0; private saveT = 45; private hatchT = 2; private foodT = 0; private leaving = false;
  private foodCache = new Map<Dragon, { x: number; y: number; thing: Interactable } | null>();
  private comboMark = new Map<EnemyLike, number>(); private questT = 0; private arenaLock: { lane: Lane; cells: [number, number][]; imgs: Phaser.GameObjects.Image[] } | null = null; private camTrack: { p: { x: number; y: number }; until: number } | null = null; private airT = 18; private warship: Warship | null = null; private elMark = new Map<EnemyLike, { el: Element; t: number }>(); private timeK = 1; private slowT = 0; private counterT = 0; private surgeTold = false;
  /** extra camera zoom for cutscenes and captures (1 = normal) */
  cineZoom = 1;
  private lookX = 0; private fz = 1; private mistA = 0; private inCloud = false; private vign!: Phaser.GameObjects.Image; private mist!: Phaser.GameObjects.Rectangle; private fallT = 0; private caveK = 0; private camY = 0;

  constructor() { super('Island'); }
  init(data: IslandEntry): void { this.entry = data; }

  create(): void {
    const site = siteById(game.save.worldSeed, this.entry.islandId) ?? siteById(game.save.worldSeed, 'alvamar')!;
    this.island = loadIsland(site);
    game.populate(this.island);
    game.save.player.island = this.island.id;
    if (!game.save.ocean.discovered.includes(this.island.id)) game.save.ocean.discovered.push(this.island.id);
    this.lanes = []; this.mount = null; this.focus = null; this.leaving = false; this.warship = null; this.elMark.clear(); this.slowT = 0; this.timeK = 1; this.counterT = 0; this.airT = 18; this.foodCache.clear(); this.comboMark.clear(); this.buildQueue = [];

    // ── cameras: sky (backdrop) → one per lane, back to front → overlay (tint, weather, fades) ──
    const W0 = this.scale.width, H0 = this.scale.height;
    this.skyCam = this.cameras.main;
    const laneDefs = laneList(this.island);
    const laneCams = laneDefs.map((l) => this.cameras.add(0, 0, W0, H0, false, 'lane' + l.depth).setRoundPixels(true));
    this.overlayCam = this.cameras.add(0, 0, W0, H0, false, 'overlay');
    this.cameras.main = this.overlayCam; // fades / flashes cover every lane
    this.camAll = 0; for (const c of this.cameras.cameras) this.camAll |= c.id;
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (go: Phaser.GameObjects.GameObject) => { if (this.tagCam) this.tagTo(go, this.tagCam); });

    this.tagCam = this.skyCam;
    this.backdrop = new Backdrop(this, this.island.biome, this.island.seaRow * TILE);

    laneDefs.forEach(({ depth, data }, i) => {
      const cam = laneCams[i];
      this.tagCam = cam;
      const lane = { depth, data, cam, dragons: [], enemies: [], things: [], npcs: [], triggers: [] } as unknown as Lane;
      lane.world = this.makeWorld(lane);
      lane.cm = cam.filters.internal.addColorMatrix(); // per-lane grade: desaturated distance, dark foreground silhouette
      lane.vfx = new VfxManager(this, (o) => this.tagTo(o, cam));
      lane.view = new IslandView(this, data);
      if (depth === 0) lane.view.addSkyClouds(data, (x) => ceilingY(lane.world, x));
      lane.shots = new Projectiles(lane.world);
      lane.haze = this.add.rectangle(-W0 * 3, -H0 * 3, W0 * 7, H0 * 7, 0xc8dcf0, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint - 1);
      lane.things = buildInteractables({ world: lane.world, view: lane.view, sail: () => this.sail(), rest: (x, y) => this.rest(x, y), nest: (x, y) => this.useNest(x, y) }, data.spawns);
      for (const s of data.spawns) {
        if (s.t === 'enemy') lane.enemies.push(new Enemy(lane.world, s.kind, s.x, s.y));
        else if (s.t === 'npc') { const n = new Npc(lane.world, s.who, s.x, s.y, s.range); lane.npcs.push(n); lane.things.push(n.interactable); }
        else if (s.t === 'trigger') lane.triggers.push(s);
        else if (s.t === 'boss' && !flag('boss_' + s.boss)) {
          if (s.boss === 'bruto') lane.enemies.push(new BrutoBoss(lane.world, s.x, s.y, s.arena, this.bossHooks(lane)));
          else { const a = new AlphaBoss(lane.world, s.x, s.y, s.arena, this.bossHooks(lane)); lane.enemies.push(a, ...a.anchors); }
        }
      }
      this.lanes.push(lane);
    });
    const byDepth = (d: number | undefined): Lane => this.lanes.find((l) => l.depth === (d ?? 0)) ?? this.lanes.find((l) => l.depth === 0)!;

    this.tagCam = this.overlayCam;
    this.weather = new WeatherFx(this, this.island.weather, this.island.biome);
    this.tintRect = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint).setBlendMode(Phaser.BlendModes.MULTIPLY);
    // flight immersion: speed vignette and cloud mist, screen-fixed above the world
    if (!this.textures.exists('flight-vignette')) {
      const c = this.textures.createCanvas('flight-vignette', 256, 144)!, x = c.getContext();
      const gr = x.createRadialGradient(128, 72, 40, 128, 72, 150); gr.addColorStop(0, 'rgba(8,10,24,0)'); gr.addColorStop(0.6, 'rgba(8,10,24,0.15)'); gr.addColorStop(1, 'rgba(8,10,24,0.85)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 144); c.refresh();
    }
    this.vign = this.add.image(0, 0, 'flight-vignette').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint + 2).setAlpha(0);
    this.mist = this.add.rectangle(0, 0, 10, 10, 0xf4f8ff, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint + 1);

    // where does the player arrive?
    const p = game.save.player, dock = this.island.spawns.find((s) => s.t === 'dock');
    let px = this.island.start.x, py = this.island.start.y, lane = byDepth(0);
    if (this.entry.entry === 'load' && p.x >= 0) { px = p.x; py = p.y; lane = byDepth(p.lane); }
    else if (this.entry.entry === 'respawn' && p.checkpoint.island === this.island.id && p.checkpoint.x >= 0) { px = p.checkpoint.x; py = p.checkpoint.y; lane = byDepth(p.checkpoint.lane); }
    else if (this.entry.entry === 'dock' && dock) { px = dock.x; py = dock.y; }
    else if (this.entry.entry === 'air-west') { px = 150; py = (this.island.seaRow - 13) * TILE; }
    else if (this.entry.entry === 'air-east') { px = this.island.grid.pxW - 150; py = (this.island.seaRow - 13) * TILE; }
    if (p.checkpoint.x < 0) p.checkpoint = { island: this.island.id, x: px, y: py, lane: 0 };
    this.lane = lane; this.laneT = lane.depth; p.lane = lane.depth;
    this.tagCam = lane.cam;
    this.player = new Player(lane.world, px, py);

    // the party (companion + followers) travels with the player; kept dragons live where they were left
    const comp = game.companion;
    game.party().forEach((r, i) => {
      if (r.island !== this.island.id) { r.island = this.island.id; r.homeX = px; r.homeY = py; }
      if (this.entry.entry !== 'load') { r.x = px - 30 - i * 34; r.y = py - (this.entry.entry.startsWith('air') && r !== comp ? 60 + i * 18 : 0); r.lane = lane.depth; }
    });
    for (const rec of game.dragonsOn(this.island.id)) this.addDragon(rec, byDepth(rec.lane));
    this.tagCam = byDepth(0).cam;
    for (const e of game.save.eggs) if (e.island === this.island.id) this.add.image(e.x, e.y - 2, 'props', 'egg').setOrigin(0.5, 1).setDepth(DEPTH.entities).setName('egg-' + e.id);
    this.tagCam = lane.cam;

    lane.cam.setBounds(0, -400, this.grid.pxW, this.grid.pxH + 400);
    lane.cam.centerOn(px, py - 40); this.camY = py - 40;
    this.syncLaneCams(0);
    this.overlayCam.fadeIn(500, 8, 6, 16);

    if (this.entry.entry.startsWith('air') && comp) {
      const d = this.dragons.find((x) => x.rec === comp);
      if (d) { d.build(); d.body.x = px; d.body.y = py; d.facing = this.entry.entry === 'air-west' ? 1 : -1; d.body.vx = d.facing * 120; this.doMount(d, true); d.air = true; d.flight.airborne = true; }
      // wingmates arrive alongside, in the air
      for (const w of this.dragons) if (w.rec !== comp && w.rec.bonded && w.rec.follow && !w.rec.kept) { if (!w.ready) w.build(); w.facing = this.entry.entry === 'air-west' ? 1 : -1; w.body.vx = w.facing * 110; w.air = true; }
    }
    const offParty = events.on('partyChanged', (e) => this.onPartyChanged(e.id, e.how));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offParty);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      hud.minimap = null; hud.lanes = null; this.tagCam = null; this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE);
      for (const l of this.lanes) l.shots.clear();
      DragonTextures.dispose(this); input.clearVirtual();
      for (const k of ['water-surface', 'lava-surface']) if (this.textures.exists(k)) this.textures.remove(k);
    });
    events.emit('areaTitle', { title: this.island.name, subtitle: this.island.subtitle });
    hud.mode = this.mount ? 'flight' : 'ground'; hud.prompt = null; hud.dialog = null;
    this.paintMinimaps();
    this.applyAmbience(0);
    if (this.island.id === 'alvamar' && !flag('intro')) {
      setFlag('intro');
      this.time.delayedCall(1600, () => events.emit('talk', { speaker: 'Velho Tor', lines: ['Ah, acordou! Te tirei do mar ontem, agarrado num pedaço de mastro.', 'Isto aqui é Vigiamar. Gente boa, dragões por perto… e caçadores rondando.', 'A Chefe Ragna quer te ver. O Salão fica no alto da praça, à direita.'] }));
    }
    if (DEBUG) (window as unknown as Record<string, unknown>).__scene = this;
  }

  private bossHooks(lane: Lane): BossHooks {
    return {
      lock: (x0, x1) => {
        const g = lane.data.grid, cells: [number, number][] = [], imgs: Phaser.GameObjects.Image[] = [];
        const prev = this.tagCam; this.tagCam = lane.cam;
        for (const px of [x0, x1]) {
          const tx = Math.floor(px / TILE), top = (g.groundBelow(px, 0, g.h) ?? lane.data.seaRow * TILE) / TILE;
          for (let ty = top - 9; ty < top; ty++) if (g.inb(tx, ty) && g.cells[ty * g.w + tx] !== Cell.Solid) { cells.push([tx, ty]); g.cells[ty * g.w + tx] = Cell.Solid; }
          for (let k = 0; k < 3; k++) imgs.push(this.add.image(tx * TILE + 8, top * TILE - k * 38, 'props', 'palisade').setOrigin(0.5, 1).setDepth(DEPTH.entities + 4));
        }
        this.tagCam = prev;
        this.arenaLock = { lane, cells, imgs }; this.arenaLockX = (x0 + x1) / 2;
        audio.setMusic('tense');
      },
      unlock: () => { const a = this.arenaLock; if (!a) return; for (const [tx, ty] of a.cells) a.lane.data.grid.cells[ty * a.lane.data.grid.w + tx] = Cell.Empty; for (const i of a.imgs) i.destroy(); this.arenaLock = null; },
      adds: (kind, n, x) => { const prev = this.tagCam; this.tagCam = lane.cam; for (let i = 0; i < n; i++) { const ex = x + (i % 2 ? 1 : -1) * (60 + i * 20), gy = lane.data.grid.groundBelow(ex, 0, lane.data.grid.h) ?? lane.data.seaRow * TILE; const e = new Enemy(lane.world, kind, ex, gy - 2); e.aggro = true; lane.enemies.push(e); lane.vfx.play('poof', ex, gy, {}); } this.tagCam = prev; },
      intro: (id) => {
        if (id === 'bruto') events.emit('talk', { speaker: 'Bruto Garra-de-Ferro', lines: ['Hah! O ladrãozinho de dragões da vila!', 'A Capitã Varga paga bem por escamas. E por quem atrapalha também!'] });
        else events.emit('talk', { speaker: '', lines: ['Um dragão-alfa, gigante, preso por quatro correntes de ferro.', 'Quebre as âncoras. Fique perto delas quando ele cuspir fogo; pule as ondas de choque.'] });
      },
      defeated: (id) => {
        setFlag('boss_' + id); audio.setMusic('calm'); audio.play('bond');
        if (id === 'bruto') { game.addItem('coin', 100); events.emit('talk', { speaker: 'Bruto Garra-de-Ferro', lines: ['Argh… chega, chega!', 'Você acha que me venceu? A Capitã Varga tem um gigante acorrentado na forja do Monte Brasaviva.', 'Quando as armas de escama ficarem prontas… nenhuma vila vai resistir.'] }); events.emit('toast', { text: '+100 moedas', icon: 'coin' }); }
        else {
          const prev = this.tagCam; this.tagCam = lane.cam;
          const bx = (this.arenaLockX ?? this.player.body.x) + 70, gy = lane.data.grid.groundBelow(bx, 0, lane.data.grid.h) ?? this.player.body.y;
          const v = this.add.sprite(bx, gy + 1, 'people', 'varga_idle_0').setOrigin(22 / 48, 44 / 48).setFlipX(true).setDepth(DEPTH.entities + 2).play('pp-varga-idle');
          this.tagCam = prev; lane.vfx.play('poof', bx, gy, {});
          events.emit('talk', { speaker: 'Capitã Varga Ferro-Rubro', lines: ['Você soltou meu gigante. Que comovente.', 'Aproveite a vitória, Vinculado. Os Caçadores de Escama têm muitos navios…', '…e eu tenho paciência. Até a próxima maré.'] });
          this.time.delayedCall(2500, () => { lane.vfx.play('poof', v.x, v.y, { scale: 1.4 }); v.destroy(); });
          game.addItem('coin', 120); events.emit('toast', { text: 'O Gigante está livre! +120 moedas', icon: 'star' });
        }
      },
    };
  }
  private arenaLockX: number | null = null;

  /** Render `go` with one camera only (all other cameras of this scene ignore it). */
  private tagTo(go: Phaser.GameObjects.GameObject, cam: Phaser.Cameras.Scene2D.Camera): void { (go as unknown as { cameraFilter: number }).cameraFilter = this.camAll & ~cam.id; }

  /** Zoom, fade and haze every lane camera by its depth relative to the (animated) active depth. */
  private syncLaneCams(dt: number): void {
    const target = this.lane.depth;
    this.laneT += (target - this.laneT) * Math.min(1, dt * 6);
    if (Math.abs(target - this.laneT) < 0.002) this.laneT = target;
    const act = this.lane.cam, sx = act.scrollX, sy = act.scrollY;
    for (const l of this.lanes) {
      const d = l.depth - this.laneT, z = Math.pow(1.6, d) * this.fz * this.cineZoom, ad = Math.abs(d);
      l.cam.setZoom(z);
      if (l !== this.lane) {
        // distant lanes sit a little higher on screen (their relief peeks over ours), near ones hug the bottom edge
        const lift = d < 0 ? 26 * -d : -34 * d;
        l.cam.scrollX = sx; l.cam.scrollY = sy + lift / z;
      }
      // lanes in front of you turn see-through, so they never hide where you are
      const alpha = d > 1 ? Math.max(0, (2 - d) * 0.3) : d > 0.05 ? 1 - Math.min(1, d) * 0.7 : 1;
      l.cam.setAlpha(alpha).setVisible(alpha > 0.02);
      l.haze.setFillStyle(this.hazeColor, d < 0 ? Math.min(0.32, ad * 0.14) : 0);
      l.cm.active = ad > 0.01;
      if (l.cm.active) {
        const m = l.cm.colorMatrix.reset();
        if (d < 0) m.saturate(-Math.min(0.55, ad * 0.3), true).brightness(1 + Math.min(0.06, ad * 0.03), true);
        else m.saturate(-Math.min(0.7, ad * 0.45), true).brightness(Math.max(0.28, 1 - ad * 0.62), true);
      }
    }
  }
  private hazeColor = 0xc8dcf0;

  /** Is there room for `b` in lane `l` at its x? Searches a few tiles up (and down while airborne). */
  private freeSpot(l: Lane, b: { x: number; y: number; w: number; h: number }, airborne: boolean): number | null {
    const g = l.data.grid, fits = (y: number): boolean => {
      for (let yy = y - b.h + 1; yy <= y - 1; yy += 8) for (const xx of [b.x - b.w / 2 + 1, b.x, b.x + b.w / 2 - 1]) if (g.solidPx(xx, yy)) return false;
      return !g.solidPx(b.x, y - 1) && g.liquidAt(b.x, y - 4) !== Liquid.Lava;
    };
    for (let k = 0; k <= 4; k++) { if (fits(b.y - k * TILE)) return b.y - k * TILE; if (airborne && k > 0 && fits(b.y + k * TILE)) return b.y + k * TILE; }
    return null;
  }

  /** Step into the lane behind (-1) or in front (+1), taking the mount and a following companion along. */
  private switchLane(dir: -1 | 1): void {
    const i = this.lanes.indexOf(this.lane), to = this.lanes[i + dir], from = this.lane;
    if (!to) { events.emit('toast', { text: dir < 0 ? 'Não há nada mais ao fundo daqui.' : 'Não há camada mais à frente.' }); audio.play('deny'); return; }
    const pl = this.player, mover = this.mount ? this.mount.body : pl.body;
    const y = this.freeSpot(to, mover, !!this.mount?.air || !mover.onGround);
    if (y === null) { events.emit('toast', { text: `Caminho bloqueado: a camada ${LANE_NAMES[to.depth]} tem rocha neste ponto.` }); audio.play('deny'); this.shake(1); return; }
    from.vfx.puff(mover.x, mover.y - 12, 0xffffff, 6, { speed: 40, gravity: 0, spread: 180, life: 300 });
    const moveDragon = (d: Dragon): void => {
      from.dragons.splice(from.dragons.indexOf(d), 1); to.dragons.push(d); d.world = to.world; d.rec.lane = to.depth;
      for (const o of d.objects()) this.tagTo(o, to.cam);
    };
    mover.y = y;
    if (this.mount) { moveDragon(this.mount); }
    pl.world = to.world; this.tagTo(pl.sprite, to.cam);
    if (!this.mount && mover.onGround) mover.vy = -90;
    // a following companion comes along if it is close
    const party = from.dragons.filter((d) => d.rec.bonded && !d.ridden && d.rec.follow && !d.rec.kept && Math.hypot(d.body.x - mover.x, d.body.y - mover.y) < 260);
    party.forEach((comp, i) => {
      const fx = mover.x - pl.facing * (30 + i * 30);
      const cy = this.freeSpot(to, { x: fx, y: mover.y, w: comp.body.w, h: comp.body.h }, true);
      moveDragon(comp); comp.body.x = fx; comp.body.y = cy ?? mover.y - 40; comp.air = cy === null || comp.air;
    });
    this.lane = to; game.save.player.lane = to.depth; this.focus = null; hud.focusId = null; this.tagCam = to.cam;
    to.cam.setBounds(0, -400, to.data.grid.pxW, to.data.grid.pxH + 400);
    to.cam.scrollX = from.cam.scrollX; to.cam.scrollY = from.cam.scrollY;
    from.cam.removeBounds();
    to.vfx.puff(mover.x, mover.y - 12, 0xffffff, 8, { speed: 50, gravity: 0, spread: 180, life: 350 });
    audio.play('dash', 0.6); audio.play('flap', 0.5);
  }

  /** Side-profile minimap of the island (terrain, water, docks, campfires), painted once per visit. */
  static readonly MM_W = 96; static readonly MM_H = 40; static readonly MM_ROWS = 52;
  private mmTop = 0;
  /** One minimap texture per lane, painted once when the scene starts (never replaced while shown). */
  private paintMinimaps(): void { for (const l of this.lanes) this.paintMinimap(l); }
  private paintMinimap(lane: Lane): void {
    const g = lane.data.grid, W = IslandScene.MM_W, H = IslandScene.MM_H, th = THEMES[this.island.biome], key = 'mm-island' + lane.depth;
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, W, H)!, c = tex.context, img = c.createImageData(W, H);
    this.mmTop = this.island.seaRow - (IslandScene.MM_ROWS - 6);
    const put = (x: number, y: number, col: number, a = 255): void => { const i = (y * W + x) * 4; img.data[i] = (col >> 16) & 255; img.data[i + 1] = (col >> 8) & 255; img.data[i + 2] = col & 255; img.data[i + 3] = a; };
    for (let mx = 0; mx < W; mx++) {
      const tx = Math.min(g.w - 1, Math.floor(((mx + 0.5) / W) * g.w));
      let top = true;
      for (let my = 0; my < H; my++) {
        const ty = this.mmTop + Math.floor(((my + 0.5) / H) * IslandScene.MM_ROWS);
        const solid = g.cell(tx, ty) === Cell.Solid, liq = g.inb(tx, ty) ? g.liquid[ty * g.w + tx] : 0;
        if (solid) { put(mx, my, top ? th.top[3] : my % 3 ? th.soil[1] : th.rock[1]); top = false; }
        else if (liq) put(mx, my, liq === Liquid.Lava ? 0xe8501c : th.water, 210);
        else { put(mx, my, 0x0c0e1a, 110); }
      }
    }
    c.putImageData(img, 0, 0);
    for (const sp of lane.data.spawns) if (sp.t === 'dock' || sp.t === 'campfire') {
      const x = Math.round((sp.x / g.pxW) * W), y = Math.round(((sp.y / TILE - this.mmTop) / IslandScene.MM_ROWS) * H);
      c.fillStyle = sp.t === 'dock' ? '#f4f0e6' : '#ffa040'; c.fillRect(x - 1, y - 2, 2, 2);
    }
    tex.refresh(); hud.mmVersion++;
  }
  private feedMinimap(): void {
    const b = this.mount ? this.mount.body : this.player.body;
    hud.minimap = { kind: 'island', tex: 'mm-island' + this.lane.depth, fx: b.x / this.grid.pxW, fy: (b.y / TILE - this.mmTop) / IslandScene.MM_ROWS, flying: !!this.mount?.air, facing: this.mount ? this.mount.facing : this.player.facing };
  }

  /** The `World` facade each entity talks to — bound to its own lane. */
  private makeWorld(lane: Lane): World {
    const self = this;
    return {
      scene: self as Phaser.Scene, get grid() { return lane.data.grid; }, get island() { return lane.data; }, get vfx() { return lane.vfx; },
      hitstop: (s) => self.hitstop(s), shake: (i, ms) => self.shake(i, ms), spawnProjectile: (p) => lane.shots.spawn(p),
      strike: (r, d, e, f, x, s, ex, o) => self.strikeIn(lane, r, d, e, f, x, s, ex, o), windAt: (x, y) => self.windIn(lane, x, y),
      foes: () => lane.enemies.filter((e) => e.alive),
      flash: (ms, c) => self.impactFlash(ms, c),
    };
  }
  private get worldRef(): World { return this.lane.world; }

  private addDragon(rec: (typeof game.save.dragons)[string], lane: Lane = this.lanes.find((l) => l.depth === (rec.lane ?? 0)) ?? this.lane): Dragon {
    const prev = this.tagCam; this.tagCam = lane.cam;
    const d = new Dragon(lane.world, rec);
    this.tagCam = prev;
    lane.dragons.push(d); this.buildQueue.push(d);
    return d;
  }

  hitstop(s: number): void { this.stop = Math.max(this.stop, s); }
  shake(i: number, ms = 120): void { if (settings.screenShake > 0) for (const l of this.lanes) l.cam.shake(ms, 0.0025 * i * settings.screenShake); }
  spawnProjectile(p: ProjectileSpec): void { this.shots.spawn(p); }
  windAt(x: number, y: number): { x: number; y: number } { return this.windIn(this.lane, x, y); }
  private windIn(lane: Lane, x: number, y: number): { x: number; y: number } {
    let wx = 0, wy = 0;
    for (const z of lane.data.winds) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { wx += z.vx; wy += z.vy; }
    return { x: wx, y: wy };
  }

  strike(rect: Rect, dmg: number, element: Element | 'physical', friendly: boolean, fromX: number, source: 'player' | 'dragon' | 'enemy', exclude?: unknown, opts?: StrikeOpts): number {
    return this.strikeIn(this.lane, rect, dmg, element, friendly, fromX, source, exclude, opts);
  }
  /** Damage resolution is per lane: nothing reaches across depth. */
  private strikeIn(L: Lane, rect: Rect, dmg: number, element: Element | 'physical', friendly: boolean, fromX: number, source: 'player' | 'dragon' | 'enemy', exclude?: unknown, opts?: StrikeOpts): number {
    let n = 0, countered = false;
    const hits = (b: { x: number; y: number; w: number; h: number }): boolean => rectsOverlap(rect, { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h });
    if (friendly) {
      for (const e of L.enemies) if (e.alive && hits(e.body)) {
        let d = dmg;
        const mark = this.comboMark.get(e) ?? -9;
        if (source === 'player' && this.time.now - mark < 1400) { d *= 2; L.vfx.play('crit', e.body.x, e.body.y, { scale: 0.8 }); this.comboMark.delete(e); }
        if (source === 'dragon' && this.counterT > 0) { d *= 2; L.vfx.play('crit', e.body.x, e.body.y - e.body.h * 0.5, { scale: 0.9 }); countered = true; }
        if (e.hurt(d, fromX, element, source, source === 'player' ? this.player.attackId : undefined)) {
          n++; if (source === 'dragon') { this.comboMark.set(e, this.time.now); this.addSurge(0.035); }
          if (source === 'dragon' && element !== 'physical' && e.alive) this.react(L, e, element);
          if (!e.alive && source === 'dragon' && e.kind !== 'warship' && e.kind !== 'skyraider') { L.vfx.play('explosion', e.body.x, e.body.y + 14, { scale: 0.45, add: true }); L.vfx.puff(e.body.x, e.body.y - 10, 0xffb040, 8, { speed: 140, gravity: 120, spread: 360, life: 400, add: true }); this.shake(2, 120); }
          if (!e.alive) { this.elMark.delete(e); if (source === 'dragon') this.addSurge(0.1); }
          if (opts && e.alive && e.kind !== 'anchor' && e.kind !== 'alpha') { const dir = Math.sign(e.body.x - fromX || 1); if (opts.knock) e.body.vx = dir * 130 * opts.knock; if (opts.launch) e.body.vy = -opts.launch; }
          if (!e.alive) this.onEnemyDead(e);
        }
      }
      if (source === 'player') for (const d of L.dragons) if (d !== exclude && d.ready && !d.ridden && !d.far && (!d.rec.bonded || d.rec.trapped) && hits(d.body)) {
        if (this.hitOnce(d)) { d.hurt(dmg, fromX, element, 'player'); n++; }
      }
    } else {
      const pl = this.player, mb = this.mount?.body;
      // riders are hit too (through the mount's body); a dash at the last moment is a perfect dodge
      if (L === this.lane && pl.alive && (mb ? hits(mb) || hits(pl.body) : hits(pl.body))) {
        if (this.mount && this.dodgeWindow()) this.perfectDodge();
        else if (this.damagePlayer(1 + (dmg > 2 ? 1 : 0), fromX)) { n++; if (this.mount) { this.mount.hitFlash = 0.14; this.shake(3, 140); } }
      }
      for (const d of L.dragons) if (d !== exclude && d.rec.bonded && d.ready && !d.ridden && hits(d.body)) { d.hurt(dmg * 0.5, fromX, element, source === 'enemy' ? 'enemy' : 'dragon'); n++; }
    }
    if (countered) this.counterT = 0;
    return n;
  }
  private hitIds = new Map<Dragon, number>();
  private hitOnce(d: Dragon): boolean { if (this.hitIds.get(d) === this.player.attackId) return false; this.hitIds.set(d, this.player.attackId); return true; }

  private damagePlayer(dmg: number, fromX: number, by?: EnemyLike): boolean {
    const pl = this.player;
    if (pl.parrying && by) { pl.hurt(dmg, fromX); by.stagger(); events.emit('toast', { text: 'Aparou!' }); return false; }
    const hit = pl.hurt(dmg, fromX);
    if (hit && this.mount && pl.hp > 0) { this.mount.vocalize('roar', pl.body.x); }
    return hit;
  }
  private onEnemyDead(e: EnemyLike): void {
    if (e.kind === 'bruto' || e.kind === 'anchor' || e.kind === 'alpha') return;
    // loot pops as floating text where the foe fell, not as a notice
    if (e.drop === 'coin') { const n = 3 + Math.floor(Math.random() * 4); game.addItem('coin', n); this.lane.vfx.floatText(e.body.x, e.body.y - 30, `+${n} moedas`, 0xf2c14e); }
    else if (e.drop && Math.random() < 0.7) { game.addItem(e.drop); this.lane.vfx.floatText(e.body.x, e.body.y - 30, `+1 ${ITEM_NAMES[e.drop]}`, 0xd8f0c0); }
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
    this.mount = null; d.ridden = false; d.sprite.setRotation(0); cancelCharge(d);
    this.player.sprite.setDepth(DEPTH.player).setVisible(true);
    this.player.dismount(d.body.x - d.facing * 4, d.body.y - (d.air ? 30 : 2), d.air ? -210 : -120);
    if (!d.rec.kept) { d.rec.follow = true; d.mind.force('follow', 0.5); }
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

  /** Menu orders for bonded dragons: call one back (it flies in from wherever it lives), keep one here, or release it. */
  private onPartyChanged(id: string, how: 'summon' | 'follow' | 'keep' | 'release'): void {
    const rec = game.save.dragons[id]; if (!rec) return;
    const pl = this.player.body;
    let d = this.lanes.flatMap((l) => l.dragons).find((x) => x.rec === rec);
    if (how === 'summon' || how === 'follow') {
      const far = !d || Math.hypot(d.body.x - pl.x, d.body.y - pl.y) > 700 || !this.lane.dragons.includes(d);
      if (!d) {
        // lives on another island: it heard the call and flies over the sea to you
        rec.island = this.island.id; rec.lane = this.lane.depth; rec.x = pl.x - this.player.facing * 320; rec.y = pl.y - 140;
        this.tagCam = this.lane.cam; d = this.addDragon(rec, this.lane); this.tagCam = this.lane.cam;
      } else if (far) {
        if (!this.lane.dragons.includes(d)) this.moveDragonTo(d, this.lane);
        d.body.x = pl.x - this.player.facing * 320; d.body.y = pl.y - 140;
      }
      if (!d.ready) d.build(); if (far) { d.air = true; d.body.vx = this.player.facing * 160; }
      d.mind.force('follow', 2); d.vocalize('chirp', pl.x);
      events.emit('toast', { text: far ? `${rec.name} ouviu seu chamado e está voando até você!` : `${rec.name} vai te seguir.`, icon: 'wing' });
    } else if (how === 'keep') {
      if (d) { d.mind.force('explore', 3); d.vocalize('purr', d.body.x); }
      events.emit('toast', { text: `${rec.name} vai viver por aqui. Chame-o de volta no menu Dragões.`, icon: 'star' });
    } else {
      if (d) { if (d.ridden) this.doDismount(); d.mind.force('explore', 4); d.vocalize('roar', d.body.x); this.vfx.play('blessing', d.body.x, d.body.y, {}); }
      events.emit('toast', { text: `${rec.name} voltou à vida selvagem. Ele vai se lembrar de você.`, icon: 'star' });
    }
    events.emit('hudDirty');
  }
  private moveDragonTo(d: Dragon, to: Lane): void {
    for (const l of this.lanes) { const i = l.dragons.indexOf(d); if (i >= 0) l.dragons.splice(i, 1); }
    to.dragons.push(d); d.world = to.world; d.rec.lane = to.depth;
    for (const o of d.objects()) this.tagTo(o, to.cam);
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
    else if (comp.mind.bond.obeys('come', Math.random())) { if (!comp.rec.kept) comp.rec.follow = true; comp.mind.force('follow', 1); comp.vocalize('chirp', pl.body.x); if (dist > 700) { comp.body.x = pl.body.x - pl.facing * 120; comp.body.y = pl.body.y - 80; comp.air = true; } }
    else events.emit('toast', { text: `${comp.rec.name} ouviu, mas está distraído.` });
    // the rest of the party answers the whistle too
    let k = 1;
    for (const d of this.dragons) {
      if (d === comp || d.ridden || !d.rec.bonded || !d.rec.follow || d.rec.kept || !d.ready) continue;
      if (!d.mind.bond.obeys('come', Math.random())) continue;
      d.mind.force('follow', 1);
      if (Math.hypot(d.body.x - pl.body.x, d.body.y - pl.body.y) > 700) { d.body.x = pl.body.x - pl.facing * (120 + k * 40); d.body.y = pl.body.y - 80 - k * 16; d.air = true; }
      k++;
    }
  }

  private commandAttack(): void {
    const comp = this.dragons.find((d) => d.rec === game.companion && !d.ridden && d.ready);
    if (!comp) return;
    let tgt: EnemyLike | null = null, bd = 240;
    for (const e of this.enemies) if (e.alive && e.kind !== 'anchor') { const d = Math.hypot(e.body.x - this.player.body.x, e.body.y - this.player.body.y); if (d < bd) { bd = d; tgt = e; } }
    if (!tgt) { events.emit('toast', { text: 'Nenhum alvo por perto.' }); return; }
    if (comp.mind.bond.obeys('attack', Math.random())) { tgt.aggro = true; comp.mind.provoke(1.2); comp.mind.force('protect', 0.6); comp.vocalize('roar', comp.body.x); this.vfx.play('exclaim', tgt.body.x, tgt.body.y - 20, { scale: 0.6 }); }
    else { events.emit('toast', { text: `${comp.rec.name} hesita.` }); audio.play('deny'); }
    for (const d of this.dragons) if (d !== comp && d.ready && !d.ridden && d.rec.bonded && d.rec.follow && !d.rec.kept && Math.abs(d.body.x - this.player.body.x) < 320 && d.mind.bond.obeys('attack', Math.random())) { d.mind.provoke(1.1); d.mind.force('protect', 0.6); }
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
    p.hp = p.maxHp; p.checkpoint = { island: this.island.id, x, y: y, lane: this.lane.depth }; events.emit('hudDirty');
    for (const d of this.dragons) if (d.rec.bonded && !d.far) { d.rec.energy = Math.min(1, d.rec.energy + 0.4); d.rec.hp = Math.min(d.ph.stats.maxHp, d.rec.hp + d.ph.stats.maxHp * 0.5); }
    this.vfx.play('heal', this.player.body.x, this.player.body.y); audio.play('bond', 0.5);
    this.saveNow('Progresso salvo. Você descansou junto ao fogo.');
  }
  private saveNow(msg?: string): void {
    const p = game.save.player, b = this.mount ? this.mount.body : this.player.body;
    p.x = b.x; p.y = b.y; p.lane = this.lane.depth; game.save.ocean.atSea = false;
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
    for (const r of game.party()) { r.island = this.island.id; r.lane = 0; }
    if (comp) { comp.island = this.island.id; comp.lane = 0; }
    game.save.player.x = -1; game.save.player.lane = 0;
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
    // slow motion after a perfect dodge or during an ultimate: real time drives the timer, game time is scaled
    const rdt = Math.min(delta / 1000, 1 / 30);
    if (this.slowT > 0) this.slowT -= rdt;
    this.timeK += ((this.slowT > 0 ? 0.3 : 1) - this.timeK) * Math.min(1, rdt * 12);
    if (Math.abs(this.timeK - 1) < 0.01) this.timeK = 1;
    this.tweens.timeScale = this.timeK; this.anims.globalTimeScale = this.timeK;
    const dt = rdt * this.timeK;
    hud.fps = this.game.loop.actualFps; hud.entities = this.lanes.reduce((n, l) => n + l.dragons.length + l.enemies.length, 0); hud.fxCount = this.lanes.reduce((n, l) => n + l.vfx.activeCount, 0);
    this.tagCam = this.lane.cam;
    input.update();
    audio.update(dt, game.daylight);
    if (hud.inMenu || this.leaving) { this.renderOnly(time, dt); return; }
    if (hud.dialog) { this.renderOnly(time, dt); return; }
    if (input.pressed('pause')) { events.emit('openMenu', undefined); return; }
    if (input.pressed('map')) { events.emit('openMenu', { tab: 'map' }); return; }
    if (this.stop > 0) { this.stop -= dt; this.vfx.update(); this.syncLaneCams(dt); return; }
    game.tick(dt);

    const pl = this.player, pb = pl.body;
    // depth lanes: step back / forward
    if (input.pressed('laneBack')) this.switchLane(-1); else if (input.pressed('laneFront')) this.switchLane(1);
    // build at most one DNA texture per frame, nearest first
    if (this.buildQueue.length) {
      let bi = -1, bd = 900;
      this.buildQueue.forEach((d, i) => { const dist = Math.abs(d.body.x - pb.x); if (dist < bd) { bd = dist; bi = i; } });
      if (bi >= 0) this.buildQueue.splice(bi, 1)[0].build();
    }

    // player / mount
    if (this.mount) {
      if (input.pressed('mount')) this.doDismount();
      else if (input.pressed('parry') && hud.surge >= 1) this.ultimate();
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
      if (r.contact) { if (this.mount && this.dodgeWindow()) this.perfectDodge(); else this.damagePlayer(e.contactDmg ?? 1, e.body.x, e); }
      // the environment marks foes too: knocked into the sea they are wet, into lava they burn
      if (e.alive && e.body.inLiquid !== Liquid.None && !this.elMark.has(e)) this.elMark.set(e, { el: e.body.inLiquid === Liquid.Lava ? 'fire' : 'water', t: this.time.now });
      if (r.shoot && e.kind === 'hunter') { const c = e.center, d = Math.hypot(pb.x - c.x, pb.y - 12 - c.y) || 1; this.shots.spawn({ x: c.x, y: c.y - 4, vx: ((pb.x - c.x) / d) * 220, vy: ((pb.y - 12 - c.y) / d) * 220, dmg: 1, element: 'physical', friendly: false, fx: 'icelance', life: 1.4, scale: 0.35 }); audio.play('dash', 0.4); }
      else if (r.shoot) { const c = e.center, d = Math.hypot(pb.x - c.x, pb.y - 12 - c.y) || 1; this.shots.spawn({ x: c.x, y: c.y, vx: ((pb.x - c.x) / d) * 150, vy: ((pb.y - 12 - c.y) / d) * 150, dmg: 1, element: 'storm', friendly: false, fx: 'sparkarc', life: 1.6, scale: 0.35 }); audio.play('zap', 0.5); }
    }
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    this.airDirector(dt);
    if ((this.laneCheckT -= dt) <= 0) {
      this.laneCheckT = 0.25;
      const i = this.lanes.indexOf(this.lane), m = this.mount ? this.mount.body : pb, air = !!this.mount?.air || !m.onGround;
      hud.lanes = { depths: this.lanes.map((l) => l.depth), active: this.lane.depth, canBack: i > 0 && this.freeSpot(this.lanes[i - 1], m, air) !== null, canFront: i < this.lanes.length - 1 && this.freeSpot(this.lanes[i + 1], m, air) !== null };
    }

    // projectiles
    this.shots.update(dt, (p, x, y) => {
      const r = p.radius ?? 8, rect = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
      return this.strike(rect, p.dmg, p.element, p.friendly, x - Math.sign(p.vx), p.friendly ? 'dragon' : 'enemy', p.owner) > 0;
    });

    for (const l of this.lanes) { this.tagCam = l.cam; for (const n of l.npcs) n.update(dt, pb.x, pb.y, l === this.lane); }
    this.tagCam = this.lane.cam;
    if ((this.questT -= dt) <= 0) {
      this.questT = 0.4;
      for (const t of this.lane.triggers) if (pb.x >= t.x0 && pb.x <= t.x1 && !flag(t.flag)) setFlag(t.flag);
      updateQuests((text, icon) => events.emit('toast', { text, icon }));
    }
    this.updateDragons(dt);
    // the other lanes keep living (their dragons roam, sleep and eat) but do not notice the player
    for (const l of this.lanes) if (l !== this.lane) {
      this.tagCam = l.cam;
      this.updateDragonsIn(l, dt, false);
      for (const t of l.things) t.update?.(dt);
      l.vfx.update();
    }
    this.tagCam = this.lane.cam;
    this.updateThings(dt);
    this.updateWorldFx(time, dt);
    this.updateCamera(dt);
    this.feedMinimap();

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

  private renderOnly(time: number, dt: number): void { this.updateWorldFx(time, dt * 0.2); this.syncLaneCams(dt); }

  private updateDragons(dt: number): void {
    if ((this.foodT -= dt) <= 0) { this.foodT = 1; this.foodCache.clear(); }
    this.updateDragonsIn(this.lane, dt, true);
  }
  private updateDragonsIn(L: Lane, dt: number, active: boolean): void {
    const pl = this.player, pb = pl.body, day = game.day, storm = this.island.weather === 'storm';
    let focus: Dragon | null = null, fd = 180;
    const aggro = active ? L.enemies.filter((e) => e.alive && e.aggro) : [];
    for (const d of [...L.dragons]) {
      const b = d.body, dist = Math.hypot(pb.x - b.x, pb.y - b.y);
      // threats
      let threat: { x: number; y: number; dist: number } | null = null;
      for (const e of aggro) { const de = Math.hypot(e.body.x - b.x, e.body.y - b.y); const rel = d.rec.bonded ? Math.min(de, Math.hypot(e.body.x - pb.x, e.body.y - pb.y) + 40) : de; if (rel < (d.rec.bonded ? 230 : 80) && (!threat || de < threat.dist)) threat = { x: e.body.x, y: e.body.y, dist: de }; }
      // natural food (cached per second)
      let food = this.foodCache.get(d);
      if (food === undefined && !d.far) {
        food = null; let bd = 320;
        if (d.rec.hunger > 0.45) for (const t of L.things) { const f = t.food?.(); if (!f || f === d.ph.dislikedFood) continue; const dd = Math.hypot(t.x - b.x, t.y - b.y); if (dd < bd && Math.abs(t.x - d.rec.homeX) < d.rec.homeR * 1.6) { bd = dd; food = { x: t.x, y: t.y, thing: t }; } }
        this.foodCache.set(d, food);
      }
      let other: { x: number; y: number; dist: number; bondedWithPlayer: boolean } | null = null;
      for (const o of L.dragons) if (o !== d && !o.far) { const dd = Math.hypot(o.body.x - b.x, o.body.y - b.y); if (dd < 170 && (!other || dd < other.dist)) other = { x: o.body.x, y: o.body.y, dist: dd, bondedWithPlayer: o.rec.bonded }; }
      const visible = active && dist < 300 && (dist < 60 || L.data.grid.los(b.x, b.y - b.h * 0.6, pb.x, pb.y - 12));
      d.update(dt, {
        day, night: game.night, storm,
        player: { x: pb.x, y: pb.y, dist: active ? dist : 9999, motion: this.mount ? 'walk' : pl.motion, visible, offering: active ? pl.offering : null, gesturing: active && pl.gesturing, mounted: !!this.mount, threatened: pl.hurtRecently > 0 || aggro.length > 0, alive: pl.alive },
        threat, food: food ? { x: food.x, y: food.y, dist: Math.hypot(food.x - b.x, food.y - b.y) } : null, other,
      });
      if (d.far || !d.ready) continue;
      if (!active) { d.feedback(); continue; }
      const it = d.intent;
      if (it?.ateWorldFood && food) { food.thing.eaten?.(); this.foodCache.delete(d); }
      if (it?.tookOffer && pl.offering) { const item = pl.offering; if (game.useItem(item)) d.mind.bond.feed(item, day); pl.offering = null; if ((game.save.player.items[item] ?? 0) <= 0) game.cycleItem(1); }
      if (pl.sudden && dist < 150 && visible && !this.mount) d.mind.bond.suddenMove(day, dist < 70 ? 1.3 : 0.8);
      // hostile strikes are resolved through world.strike (see Dragon.strike)
      d.feedback();
      if (!d.rec.bonded && d.rec.fear > 60 && it?.state !== 'flee' && it?.state !== 'attack' && it?.state !== 'defend' && it?.state !== 'trapped') d.mind.force('startled', 0.35);
      // face to face: while petting, feeding or bonding, the hero turns to the dragon and the dragon turns back
      if (!this.mount && !d.ridden && dist < 110 && this.focus === d && (pl.offering || pl.posing === 'pet' || pl.posing === 'offer' || pl.posing === 'calm' || (it?.state === 'bonding' && input.down('interact')))) {
        if (Math.abs(b.x - pb.x) > 4) pl.facing = Math.sign(b.x - pb.x);
        d.faceDir = Math.sign(pb.x - b.x) || -pl.facing; d.faceLock = 0.25;
      }
      if (!d.ridden && dist < fd && (visible || d.rec.bonded)) { fd = dist; focus = d; }
      // bonding ritual: stay still and hold Interact while the dragon lowers its head
      if (it?.state === 'bonding') {
        if (input.down('interact') && pl.holdStill > 0.2 && dist < 70) { d.mind.bondHold += dt; pl.setPose('offer', 0.15); pl.facing = Math.sign(b.x - pb.x) || 1; if (Math.random() < dt * 8) this.vfx.puff(b.x + d.facing * 20 * d.scale, b.y - 24 * d.scale, 0x7fe8d0, 1, { add: true, gravity: -40, speed: 14 }); }
        else d.mind.bondHold = Math.max(0, d.mind.bondHold - dt * 2);
        hud.bondHold = d.mind.bondHold / 2.5;
        if (d.mind.bondHold >= 2.5) this.completeBond(d);
      } else if (this.focus === d) hud.bondHold = 0;
    }
    if (!active) return;
    this.focus = focus; hud.focusId = focus?.rec.genes.id ?? null;
    if (this.mount) { this.mount.rec.x = this.mount.body.x; }
  }

  private completeBond(d: Dragon): void {
    d.mind.bond.completeBond(game.day); d.mind.bondHold = 0; d.mind.force('play', 3); hud.bondHold = 0;
    const first = game.save.stats.bonded === 0;
    game.save.stats.bonded++;
    if (!game.save.companion) game.save.companion = d.rec.genes.id;
    const full = game.party().length > game.maxFollowers;
    if (full) { d.rec.kept = true; d.rec.follow = false; d.rec.homeX = d.body.x; d.rec.homeY = d.body.y; d.rec.homeR = Math.max(d.rec.homeR, 220); }
    if (full) this.time.delayedCall(2600, () => events.emit('toast', { text: `Você já tem ${game.maxFollowers} dragão(ões) seguindo: ${d.rec.name} ficará guardado por aqui. Chame-o no menu Dragões.`, icon: 'wing' }));
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
    // a dragon performing the bonding ritual takes priority over whichever dragon happens to be nearest
    const bonding = this.dragons.find((d) => d.intent?.state === 'bonding' && Math.hypot(d.body.x - pb.x, d.body.y - pb.y) < 90);
    const f = bonding ?? this.focus, fdist = f ? Math.hypot(f.body.x - pb.x, f.body.y - pb.y) : 999;
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
      if (f && fdist < 46 && !f.rec.trapped) { pl.setPose('pet', 0.7); pl.facing = Math.sign(f.body.x - pb.x) || 1; const ev = f.mind.bond.pet(game.day); if (ev?.kind === 'pet') { if (f.rec.bonded) setFlag('pets', flag('pets') + 1); f.mind.force('approach', 0.8); f.vocalize('purr', pb.x); audio.play('ui'); } else if (ev) { f.mind.force('startled', 0.4); } }
    }
  }

  private updateWorldFx(time: number, dt: number): void {
    const cam = this.lane.cam, pl = this.player.body, W = this.scale.width;
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
    for (const l of this.lanes) l.view.update(time, dt, cam, Math.max(night, this.caveK));
    this.hazeColor = mix(sky, 0xffffff, 0.35);
    const strike = this.weather.update(dt, night, this.caveK > 0.5,
      () => { const x = cam.worldView.x + Math.random() * cam.worldView.width, top = this.grid.groundBelow(x, 0, 200); return top !== null && top < this.island.seaRow * TILE - 60 ? { x, y: top } : null; },
      (x, y) => this.vfx.play('sparkarc', x, y, { scale: 0.7 }));
    if (strike) {
      this.vfx.play('bolt', strike.x, strike.y, {}); this.shake(5, 200);
      this.strike({ x: strike.x - 24, y: strike.y - 60, w: 48, h: 70 }, 2, 'storm', false, strike.x, 'enemy');
    }
    // wind streaks inside gust zones near the camera
    for (const z of this.lane.data.winds) if (z.x < cam.worldView.right && z.x + z.w > cam.worldView.x && Math.random() < dt * 14) {
      const x = z.x + Math.random() * z.w, y = z.y + Math.random() * z.h;
      if (!this.grid.solidPx(x, y)) { const s = this.add.image(x, y, 'ocean', 'streak').setDepth(DEPTH.weather).setAlpha(0.5).setRotation(Math.atan2(z.vy, z.vx || 0.001)); this.tweens.add({ targets: s, x: x + z.vx * 0.5, y: y + z.vy * 0.5, alpha: 0, duration: 500, onComplete: () => s.destroy() }); }
    }
    if (Math.floor(time / 500) !== Math.floor((time - dt * 1000) / 500)) this.applyAmbience(this.caveK);
  }

  // ── air battles, elemental reactions, perfect dodge, Bond Surge ─────────────
  /** Where each island's war balloon patrols (tile x). */
  private static readonly WARSHIPS: Record<string, number> = { alvamar: 292, brasaviva: 196, trovao: 170 };

  /** Spawns the island's war balloon when you fly near it, and raider squads during long flights. */
  private airDirector(dt: number): void {
    const pb = this.mount ? this.mount.body : this.player.body, L = this.lane, id = this.island.id;
    this.counterT -= dt;
    const wx = IslandScene.WARSHIPS[id];
    const downed = flag('warship_' + id);
    // war balloons are an air battle: they show up when you fly near (on Alvamar only after Bruto falls)
    if (wx !== undefined && L.depth === 0 && !this.warship && this.mount?.air && (id !== 'alvamar' || flag('boss_bruto')) && (!downed || game.day - downed > 1)) {
      const x = wx * TILE;
      if (Math.abs(pb.x - x) < 900) {
        const g = L.data.grid, ground = g.groundBelow(x, 0, g.h) ?? L.data.seaRow * TILE, ay = Math.max(ceilingY(L.world, x) + 120, Math.min(ground - 150, ground - 120));
        this.tagCam = L.cam;
        this.warship = new Warship(L.world, x + 400, ay, () => !!this.mount?.air, { spawnRaider: (rx, ry) => this.spawnRaider(rx, ry), downed: (k, dx, dy) => this.airDowned(k, dx, dy), track: (pt, ms) => { this.camTrack = { p: pt, until: this.time.now + ms }; } });
        L.enemies.push(this.warship);
        if (!flag('warship_seen')) { setFlag('warship_seen'); events.emit('toast', { text: 'Um Balão de Guerra dos Caçadores!', icon: 'star' }); }
      }
    }
    if (this.warship && !this.warship.alive) this.warship = null;
    // raider squads while you are up in the air
    const raiders = L.enemies.filter((e) => e.kind === 'skyraider' && e.alive);
    for (const r of raiders) if (Math.abs(r.body.x - pb.x) > 1100) { r.alive = false; (r as unknown as { sprite: Phaser.GameObjects.Sprite }).sprite?.destroy(); }
    if (this.mount?.air && !this.arenaLock && !hud.boss) {
      this.airT -= dt;
      if (this.airT <= 0 && raiders.length < 2) {
        this.airT = 26 + Math.random() * 18;
        const side = Math.random() < 0.6 ? this.mount.facing : -this.mount.facing, n = 2 + (Math.random() < 0.4 ? 1 : 0);
        for (let k = 0; k < n; k++) this.spawnRaider(pb.x + side * (300 + k * 40), pb.y - 60 + k * 40);
        audio.play('whistle', 0.4);
      }
    }
  }
  private spawnRaider(x: number, y: number): void {
    const L = this.lane; if (L.enemies.filter((e) => e.kind === 'skyraider' && e.alive).length >= 5) return;
    this.tagCam = L.cam; L.enemies.push(new SkyRaider(L.world, x, y));
  }
  private airDowned(kind: string, x: number, y: number): void {
    if (kind === 'warship-hit') { setFlag('warship_' + this.island.id, Math.max(0.01, game.day)); return; } // shot down: no new balloon today
    if (kind !== 'warship') return;
    const n = 40 + Math.floor(Math.random() * 20); game.addItem('coin', n); this.lane.vfx.floatText(x, y - 80, `+${n} moedas`, 0xf2c14e);
    this.addSurge(0.35); audio.play('bond', 0.6);
  }

  /** Bond Surge: fills with your dragons' hits, kills, reactions and perfect dodges. */
  private addSurge(k: number): void {
    const was = hud.surge; hud.surge = Math.min(1, hud.surge + k);
    const el = (this.mount ?? this.dragons.find((d) => d.rec === game.companion))?.ph.element; if (el) hud.surgeColor = EL_COLOR[el];
    if (was < 1 && hud.surge >= 1 && !this.surgeTold) { this.surgeTold = true; events.emit('toast', { text: `Fúria do Vínculo pronta! [${keyLabel(input.bindings.keys.parry[0])}]`, icon: 'star' }); }
  }

  /** A dash that started a blink ago turns a hit into a perfect dodge. */
  private dodgeWindow(): boolean { const f = this.mount?.flight; return !!f && f.dashT > -0.12; }
  private perfectDodge(): void {
    if (this.slowT > 0 || !this.mount) return;
    const m = this.mount.body;
    this.slowT = 0.6; this.counterT = 1.8; this.addSurge(0.2);
    this.lane.vfx.play('parry', m.x, m.y - 20, { scale: 1.1, add: true }); this.lane.vfx.puff(m.x, m.y - 20, 0x9ff0ff, 12, { speed: 120, gravity: 0, spread: 360, life: 380, add: true });
    this.impactFlash(140, 0x80e8ff); audio.play('parry', 1);
    this.player.iframes = Math.max(this.player.iframes, 0.5);
  }

  /** Two different elements on the same foe within a few seconds set off a reaction. */
  private react(L: Lane, e: EnemyLike, el: Element): void {
    const now = this.time.now, mark = this.elMark.get(e);
    if (!mark || mark.el === el || now - mark.t > 4000) { this.elMark.set(e, { el, t: now }); L.vfx.play('zap', e.body.x, e.body.y - e.body.h * 0.5, { scale: 0.35, tint: EL_COLOR[el], add: true }); return; }
    this.elMark.delete(e);
    const key = [mark.el, el].sort().join('+');
    const R: Record<string, { name: string; fx: string; sc: number; r: number; dmg: number; col: number; stun?: number; launch?: number; chain?: boolean; heal?: boolean }> = {
      'fire+nature': { name: 'Incêndio', fx: 'explosion', sc: 0.9, r: 74, dmg: 4, col: 0xff7020 },
      'fire+water': { name: 'Vapor', fx: 'poof', sc: 1.4, r: 70, dmg: 3, col: 0xf0f4ff, stun: 1.4 },
      'fire+ice': { name: 'Choque térmico', fx: 'iceshatter', sc: 1.2, r: 64, dmg: 5, col: 0xbff0ff },
      'storm+water': { name: 'Eletrocução', fx: 'thunder', sc: 0.8, r: 150, dmg: 3, col: 0xc8b0ff, chain: true },
      'ice+water': { name: 'Congelado', fx: 'frostnova', sc: 0.9, r: 64, dmg: 2, col: 0xbff0ff, stun: 2.6 },
      'fire+storm': { name: 'Plasma', fx: 'explosion', sc: 1, r: 84, dmg: 5, col: 0xff90ff },
      'ice+storm': { name: 'Granizo', fx: 'iceshatter', sc: 1.1, r: 80, dmg: 4, col: 0xd8f4ff },
      'nature+water': { name: 'Florescer', fx: 'spore', sc: 1.2, r: 64, dmg: 2, col: 0x8fe07a, heal: true },
    };
    const x = R[key] ?? (key.includes('earth') ? { name: 'Estilhaços', fx: 'earthspike', sc: 0.9, r: 74, dmg: 4, col: 0xd0a868, launch: 320 } : { name: 'Reação', fx: 'crit', sc: 1, r: 60, dmg: 3, col: 0xffffff });
    const cx = e.body.x, cy = e.body.y - e.body.h * 0.5;
    L.vfx.play(x.fx, cx, cy + (x.fx === 'explosion' || x.fx === 'earthspike' ? 26 : 0), { scale: x.sc, add: x.fx !== 'poof' });
    L.vfx.puff(cx, cy, x.col, 16, { speed: 170, gravity: 40, spread: 360, life: 480, add: true });
    L.vfx.floatText(cx, cy - 26, x.name, x.col);
    const targets = x.chain ? L.enemies.filter((o) => o.alive && Math.hypot(o.body.x - cx, o.body.y - e.body.y) < x.r) : [e];
    if (x.chain) for (const o of targets) L.vfx.play('bolt', o.body.x, o.body.y, { scale: 0.7, add: true });
    this.strikeIn(L, x.chain ? { x: 0, y: 0, w: 0, h: 0 } : { x: cx - x.r, y: cy - x.r, w: x.r * 2, h: x.r * 2 }, x.dmg, 'physical', true, cx, 'dragon', undefined, { knock: 2.2, launch: x.launch ?? 160 });
    if (x.chain) for (const o of targets) if (o.alive) { o.hurt(x.dmg, cx, 'storm', 'dragon'); if (!o.alive) this.onEnemyDead(o); }
    if (x.stun) for (const o of L.enemies) if (o.alive && Math.hypot(o.body.x - cx, o.body.y - e.body.y) < x.r) { const st = o as unknown as { stun?: number }; if (st.stun !== undefined) st.stun = Math.max(st.stun, x.stun); }
    if (x.heal) { const p = game.save.player; p.hp = Math.min(p.maxHp, p.hp + 1); }
    this.shake(4, 180); this.hitstop(0.06); this.impactFlash(110, x.col); audio.play('crit', 0.9);
    this.addSurge(0.15);
  }

  /** Bond Surge ultimate: the mount's element unleashed over everything on screen. */
  private ultimate(): void {
    const m = this.mount; if (!m) return;
    hud.surge = 0;
    const L = this.lane, el = m.ph.element, col = EL_COLOR[el], view = L.cam.worldView, w = L.world;
    const D = Math.max(4, Math.round(m.ph.stats.power / 2.2));
    const foes = L.enemies.filter((e) => e.alive && e.kind !== 'anchor' && e.body.x > view.x - 40 && e.body.x < view.right + 40);
    const spots = foes.length ? foes.map((e) => ({ x: e.body.x, y: e.body.y, e })) : Array.from({ length: 5 }, (_, i) => ({ x: view.x + view.width * (0.15 + i * 0.18), y: (L.data.grid.groundBelow(view.x + view.width * (0.15 + i * 0.18), view.y, 40) ?? view.bottom), e: null as EnemyLike | null }));
    m.vocalize('roar', m.body.x); audio.play('bond', 1); audio.play('thunder', 0.7);
    this.hitstop(0.16); this.impactFlash(320, col); this.fz = 0.8; this.slowT = 0.45; this.shake(5, 300);
    L.vfx.play('blessing', m.body.x, m.body.y - 20, { scale: 1.4 }); L.vfx.puff(m.body.x, m.body.y - 20, col, 30, { speed: 220, gravity: 0, spread: 360, life: 600, add: true });
    const hit = (x: number, y: number, r: number, launch: number): void => { this.strikeIn(L, { x: x - r, y: y - r * 1.4, w: r * 2, h: r * 2 }, D, el, true, m.body.x, 'dragon', m, { knock: 2.6, launch }); };
    if (el === 'fire') {
      // meteor shower
      for (let i = 0; i < 12; i++) this.time.delayedCall(250 + i * 95, () => {
        const s = spots[i % spots.length], x = s.e?.alive ? s.e.body.x : s.x + (Math.random() - 0.5) * 120;
        w.spawnProjectile({ x: x - 130, y: view.y - 30, vx: 170, vy: 560, dmg: 1, element: 'fire', friendly: true, fx: 'fireball', scale: 1, life: 2, radius: 14, owner: m, trail: 0xff8030, add: true, aoe: { r: 64, dmg: D, fx: 'explosion', scale: 1, knock: 2.4, shake: 5 } });
      });
    } else {
      spots.forEach((s, i) => this.time.delayedCall(250 + i * 130, () => {
        const x = s.e?.alive ? s.e.body.x : s.x, y = s.e?.alive ? s.e.body.y : s.y;
        if (el === 'storm') { L.vfx.play('thunder', x, y - 20, { scale: 1.3, add: true }); L.vfx.play('bolt', x, y, { scale: 1.2, add: true }); this.impactFlash(70, 0xe0d8ff); hit(x, y, 60, 200); }
        else if (el === 'water') { L.vfx.play('wavecrash', x, y + 10, { scale: 1.5 }); L.vfx.play('whirlpool', x, y - 20, { scale: 1 }); hit(x, y, 80, 360); }
        else if (el === 'ice') { L.vfx.play('frostnova', x, y, { scale: 1.5, add: true }); hit(x, y, 80, 120); for (const o of L.enemies) if (o.alive && Math.abs(o.body.x - x) < 80) { const st = o as unknown as { stun?: number }; if (st.stun !== undefined) st.stun = 3; } }
        else if (el === 'earth') { L.vfx.play('earthspike', x, y + 30, { scale: 1.4 }); L.vfx.play('quake', x, y, { scale: 1.2 }); hit(x, y, 80, 420); this.shake(7, 200); }
        else { L.vfx.play('leafstorm', x, y - 20, { scale: 1.8 }); L.vfx.play('spore', x, y, { scale: 1.3 }); hit(x, y, 80, 200); }
        L.vfx.puff(x, y - 20, col, 14, { speed: 160, gravity: 60, spread: 360, life: 500, add: true }); audio.play('crit', 0.7);
      }));
      if (el === 'nature') { const p = game.save.player; p.hp = Math.min(p.maxHp, p.hp + 2); m.rec.hp = m.ph.stats.maxHp; L.vfx.play('heal', this.player.body.x, this.player.body.y - 10, { scale: 1.2 }); }
    }
    // a screen-wide sweep in the facing direction, so the ultimate always fills the view
    const SWEEP: Record<string, [string, number, boolean]> = { fire: ['explosion', 1.2, true], water: ['wavecrash', 2.2, false], storm: ['thunder', 1.6, true], ice: ['frostnova', 1.8, true], earth: ['earthspike', 1.8, false], nature: ['leafstorm', 2.4, false] };
    const [sfx, ssc, sadd] = SWEEP[el];
    for (let i = 0; i < 6; i++) this.time.delayedCall(200 + i * 110, () => {
      const t = (i + 0.5) / 6, x = m.facing > 0 ? view.x + view.width * t : view.right - view.width * t;
      const gy = L.data.grid.groundBelow(x, view.y, 60) ?? view.bottom, y = el === 'earth' || el === 'water' ? Math.min(gy, view.bottom - 10) + 20 : view.y + view.height * (0.35 + 0.25 * Math.sin(i * 1.7));
      L.vfx.play(sfx, x, y, { scale: ssc, add: sadd }); hit(x, y - 20, 70, 260); this.shake(3, 120);
    });
    // the sky answers: a burst of element-coloured motes across the whole view
    for (let i = 0; i < 10; i++) L.vfx.puff(view.x + Math.random() * view.width, view.y + Math.random() * view.height * 0.7, col, 3, { speed: 40, gravity: el === 'ice' ? 60 : -20, spread: 360, life: 1200, add: true });
  }

  /** Short, soft impact flash (a translucent tint, never a full white-out). */
  private flashRect: Phaser.GameObjects.Rectangle | null = null;
  impactFlash(ms: number, color: number): void {
    if (settings.screenShake <= 0) return;
    if (!this.flashRect || !this.flashRect.scene) { const prev = this.tagCam; this.tagCam = this.overlayCam; this.flashRect = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.tint + 3).setBlendMode(Phaser.BlendModes.ADD); this.tagCam = prev; }
    const r = this.flashRect; this.tweens.killTweensOf(r);
    r.setSize(this.scale.width + 4, GAME_H + 4).setFillStyle(color, 0.28).setAlpha(1);
    this.tweens.add({ targets: r, alpha: 0, duration: ms * 2, ease: 'Quad.Out' });
  }

  /** Flight immersion: the view pulls back with speed, rumbles on low passes, and clouds wash over the screen. */
  private flightFeel(dt: number, W: number): void {
    const m = this.mount, air = !!m?.air, cs = settings.flightCam, cam = this.lane.cam;
    const f = m?.flight, k = air && f ? f.speedK : 0;
    const diving = air && m!.body.vy > 220;
    const fzT = air ? 1 - (0.12 * k + (diving ? 0.035 : 0) + (f && f.dashT > 0 ? 0.03 : 0)) * cs : 1;
    this.fz += (fzT - this.fz) * Math.min(1, dt * (fzT < this.fz ? 1.6 : 2.4));
    if (Math.abs(this.fz - 1) < 0.001) this.fz = 1;
    if (air && f && cs > 0 && settings.screenShake > 0) {
      const rum = (f.skim * 1.6 + (diving ? Math.min(1, (m!.body.vy - 220) / 140) * 0.8 : 0)) * cs * settings.screenShake;
      if (rum > 0.05) { cam.scrollX += (Math.random() - 0.5) * rum * 2; cam.scrollY += (Math.random() - 0.5) * rum * 2; }
      if (f.flapKick > 0.3) cam.scrollY -= (f.flapKick - 0.3) * 6 * cs; // each wingbeat lifts the view a touch
    }
    // clouds: punching through one fills the screen with mist and beads the dragon with droplets
    let cloud = 0;
    if (air && m && this.lane.depth === 0) {
      const bx = m.body.x, by = m.body.y - 16;
      for (const p of this.lane.view.skyPuffs) { const im = p.img, hw = im.width / 2, hh = im.height / 2; if (Math.abs(bx - im.x) < hw - 6 && Math.abs(by - im.y) < hh - 2) { cloud = p.front ? 0.5 : 0.32; break; } }
    }
    if (cloud > 0 && !this.inCloud) { audio.play('flap', 0.4); audio.play('dash', 0.25); }
    if (cloud > 0 && m && Math.random() < dt * 30) this.vfx.puff(m.body.x - m.facing * 20, m.body.y - 20 + (Math.random() - 0.5) * 30, 0xffffff, 1, { speed: 30, gravity: 0, life: 500, spread: 180 });
    this.inCloud = cloud > 0;
    this.mistA += (cloud * cs - this.mistA) * Math.min(1, dt * (cloud > this.mistA ? 5 : 1.6));
    this.mist.setSize(W + 4, GAME_H + 4).setFillStyle(0xf4f8ff, this.mistA);
    const va = air ? Math.max(0, k - 0.35) * 0.9 * cs + (f && f.dashT > 0 ? 0.25 * cs : 0) : 0;
    this.vign.setDisplaySize(W + 4, GAME_H + 4).setAlpha(this.vign.alpha + (va - this.vign.alpha) * Math.min(1, dt * 4));
  }

  private updateCamera(dt: number): void {
    const cam = this.lane.cam, b = this.mount ? this.mount.body : this.player.body, W = this.scale.width;
    // during a boss fight frame both the player and the boss
    const track = this.camTrack && this.time.now < this.camTrack.until ? { x: this.camTrack.p.x, y: this.camTrack.p.y - 40 } : null;
    const boss = track ?? this.lane.enemies.map((e) => (e as { focus?: { x: number; y: number } | null }).focus).find((f) => f);
    const ahead = boss ? Phaser.Math.Clamp((boss.x - b.x) * 0.45, -150, 150) : this.mount?.air ? Phaser.Math.Clamp(b.vx * 0.42, -110, 110) : this.player.facing * 22;
    this.lookX += (ahead - this.lookX) * Math.min(1, dt * 2.5);
    const ty = boss ? Math.min(b.y - 46, (b.y + boss.y) / 2 - 10) : b.y - (this.mount?.air ? 30 + Phaser.Math.Clamp(-b.vy * 0.15, -40, 40) : 46);
    this.camY += (ty - this.camY) * Math.min(1, dt * (this.mount ? 5 : b.onGround ? 6 : 3.5));
    if (Math.abs(ty - this.camY) > 70) this.camY = ty - Math.sign(ty - this.camY) * 70;
    cam.scrollX += (b.x + this.lookX - W / 2 - cam.scrollX) * Math.min(1, dt * 8);
    cam.scrollY = this.camY - GAME_H / 2 + 20;
    this.flightFeel(dt, W);
    if (this.grid.liquidAt(b.x, b.y - 30) === Liquid.Water && !this.mount) this.tintRect.setFillStyle(mulColor(this.tintRect.fillColor, 0xa8d8f0));
    this.syncLaneCams(dt);
  }
}
