import { MAT, SPECIAL, VARIANT_BASE, UP, RIGHT, DOWN, LEFT } from '../../art/tiles';
import type { BiomeId } from '../../art/themes';
import { TILE } from '../../core/constants';
import { Cell, Liquid, TileGrid } from '../../physics/TileGrid';
import { hashInts, mulberry32, type Rng } from '../../utils/rng';
import type { Habitat, IslandData, LightDef, PropPlacement, Spawn, WeatherId, WindZone } from './types';

const enum M { None = 0, Earth = 1, Sand = 2, Rock = 3, Ruin = 4 }
const enum BG { None = 0, Rock = 1, Ruin = 2, Wood = 3 }
const MAT_BASE = [0, MAT.EARTH, MAT.SAND, MAT.ROCK, MAT.RUIN];

/**
 * Terrain authoring DSL shared by the hand-built islands and the procedural generator.
 * Coordinates are in tiles; "elev" is height above sea level (positive = up).
 */
export class IslandBuilder {
  readonly grid: TileGrid;
  readonly rng: Rng;
  props: PropPlacement[] = []; spawns: Spawn[] = []; habitats: Habitat[] = []; winds: WindZone[] = []; lights: LightDef[] = [];
  heights: number[] = [];
  private mat: Uint8Array; private bgm: Uint8Array; private special: Uint16Array; private noDecor: Uint8Array;
  private ids = 0;

  constructor(readonly id: string, readonly biome: BiomeId, readonly w: number, readonly h: number, readonly sea: number, readonly seed: number) {
    this.grid = new TileGrid(w, h); this.rng = mulberry32(seed);
    this.mat = new Uint8Array(w * h); this.bgm = new Uint8Array(w * h); this.special = new Uint16Array(w * h); this.noDecor = new Uint8Array(w);
  }

  private i(x: number, y: number): number { return y * this.w + x; }
  row(elev: number): number { return this.sea - Math.round(elev); }
  /** Pixel position standing on the surface of column x. */
  at(x: number): { x: number; y: number } { return { x: x * TILE + TILE / 2, y: this.surfaceRow(x) * TILE }; }
  /** Pixel position at an explicit elevation. */
  px(x: number, elev: number): { x: number; y: number } { return { x: x * TILE + TILE / 2, y: this.row(elev) * TILE }; }
  nextId(kind: string): string { return `${this.id}:${kind}${this.ids++}`; }

  surfaceRow(x: number): number {
    x = Math.max(0, Math.min(this.w - 1, Math.round(x)));
    for (let y = 0; y < this.h; y++) { const c = this.grid.cells[this.i(x, y)]; if (c === Cell.Solid || c === Cell.OneWay) return y; }
    return this.h;
  }
  /** First solid row at or below a given row (for placing things inside caves). */
  floorRow(x: number, fromRow: number): number {
    for (let y = Math.max(0, fromRow); y < this.h; y++) if (this.grid.cells[this.i(x, y)] === Cell.Solid) return y;
    return this.h;
  }
  floorAt(x: number, elev: number): { x: number; y: number } { return { x: x * TILE + TILE / 2, y: this.floorRow(x, this.row(elev)) * TILE }; }

  /** Piecewise-linear elevation profile with a touch of deterministic roughness. */
  profile(pts: ReadonlyArray<readonly [number, number]>, rough = 0.6): this {
    for (let x = 0; x < this.w; x++) {
      let k = 0; while (k < pts.length - 2 && pts[k + 1][0] <= x) k++;
      const [x0, e0] = pts[k], [x1, e1] = pts[k + 1];
      const t = Math.max(0, Math.min(1, (x - x0) / Math.max(1, x1 - x0)));
      const steep = Math.abs(e1 - e0) / Math.max(1, x1 - x0);
      const n = (Math.sin(x * 0.9 + this.seed) + Math.sin(x * 0.37 + this.seed * 1.7)) * 0.5 * rough * (steep > 1.2 ? 0.3 : 1);
      this.heights[x] = Math.round(e0 + (e1 - e0) * t + n);
    }
    return this;
  }

  /** Fill solid ground under the profile. */
  terrain(): this {
    for (let x = 0; x < this.w; x++) {
      const e = this.heights[x], sy = this.sea - e;
      let avg = 0; for (let k = -3; k <= 3; k++) avg += this.heights[Math.max(0, Math.min(this.w - 1, x + k))]; avg /= 7;
      const beach = avg <= 2.6;
      const soil = 3 + Math.floor((Math.sin(x * 0.5 + this.seed) + 1) * 1.5);
      for (let y = Math.max(0, sy); y < this.h; y++) {
        const d = y - sy;
        this.set(x, y, beach ? (d < 4 ? M.Sand : M.Rock) : d < soil ? M.Earth : M.Rock);
      }
    }
    return this;
  }

  private set(x: number, y: number, m: M): void {
    if (!this.grid.inb(x, y)) return;
    this.mat[this.i(x, y)] = m; this.grid.cells[this.i(x, y)] = m ? Cell.Solid : Cell.Empty;
    if (!m) this.special[this.i(x, y)] = 0;
  }
  solidRect(x: number, y: number, w: number, h: number, kind: 'earth' | 'sand' | 'rock' | 'ruin'): this {
    const m = kind === 'earth' ? M.Earth : kind === 'sand' ? M.Sand : kind === 'rock' ? M.Rock : M.Ruin;
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.set(x + k, y + j, m);
    return this;
  }
  /** Solid blob (floating islets, boulders). */
  blob(cx: number, cy: number, rx: number, ry: number, kind: 'earth' | 'rock'): this {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1 + (hashInts(x, y, this.seed) % 100) / 500) this.set(x, y, kind === 'earth' && y - (cy - ry) < 2 ? M.Earth : M.Rock);
    }
    return this;
  }
  private carveCell(x: number, y: number, bg: BG): void {
    if (!this.grid.inb(x, y) || x < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    if (this.mat[this.i(x, y)]) { this.set(x, y, M.None); this.bgm[this.i(x, y)] = bg; }
  }
  /** Carve a winding tunnel through elevation waypoints. */
  tunnel(pts: ReadonlyArray<readonly [number, number]>, r = 2, bg: 'rock' | 'ruin' = 'rock'): this {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, e0] = pts[k], [x1, e1] = pts[k + 1], n = Math.ceil(Math.hypot(x1 - x0, e1 - e0));
      for (let s = 0; s <= n; s++) {
        const t = s / n, cx = x0 + (x1 - x0) * t, cy = this.sea - (e0 + (e1 - e0) * t), rr = r + Math.sin(s * 0.7 + this.seed) * 0.5;
        for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr - 0.5); x <= cx + rr + 0.5; x++)
          if ((x - cx) ** 2 / (rr + 0.5) ** 2 + (y - cy) ** 2 / rr ** 2 <= 1) this.carveCell(x, y, bg === 'rock' ? BG.Rock : BG.Ruin);
      }
    }
    return this;
  }
  chamber(cx: number, elev: number, rx: number, ry: number, bg: 'rock' | 'ruin' = 'rock'): this {
    const cy = this.sea - elev;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const flat = y > cy + ry * 0.55 ? 0.3 : 0; // flatter floors
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 - flat + (hashInts(x, y, this.seed) % 100) / 700) this.carveCell(x, y, bg === 'rock' ? BG.Rock : BG.Ruin);
    }
    return this;
  }
  /** Vertical shaft with alternating one-way ledges, to climb inside a sea stack. */
  shaft(x: number, elevBottom: number, elevTop: number, width = 4): this {
    for (let e = elevBottom; e <= elevTop; e++) for (let k = 0; k < width; k++) this.carveCell(x + k, this.sea - e, BG.Rock);
    for (let e = elevBottom + 2, n = 0; e < elevTop; e += 3, n++) this.platform(x + (n % 2 ? width - 2 : 0), e, 2);
    return this;
  }
  bgRect(x: number, y: number, w: number, h: number, kind: 'rock' | 'ruin' | 'wood'): this {
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) if (this.grid.inb(x + k, y + j)) this.bgm[this.i(x + k, y + j)] = kind === 'rock' ? BG.Rock : kind === 'ruin' ? BG.Ruin : BG.Wood;
    return this;
  }
  private setSpecial(x: number, y: number, tile: number, cell: Cell): void {
    if (!this.grid.inb(x, y) || this.mat[this.i(x, y)]) return;
    this.special[this.i(x, y)] = tile + 1; this.grid.cells[this.i(x, y)] = cell;
  }
  /** One-way wooden platform, `len` tiles starting at x, at elevation. */
  platform(x: number, elev: number, len: number): this {
    const y = this.sea - elev;
    for (let k = 0; k < len; k++) this.setSpecial(x + k, y, len === 1 ? SPECIAL.PLAT_M : k === 0 ? SPECIAL.PLAT_L : k === len - 1 ? SPECIAL.PLAT_R : SPECIAL.PLAT_M, Cell.OneWay);
    return this;
  }
  bridge(x: number, elev: number, len: number): this {
    for (let k = 0; k < len; k++) this.setSpecial(x + k, this.sea - elev, SPECIAL.BRIDGE, Cell.OneWay);
    return this;
  }
  spikes(x: number, len: number): this {
    for (let k = 0; k < len; k++) { const y = this.surfaceRow(x + k) - 1; this.setSpecial(x + k, y, SPECIAL.SPIKES, Cell.Hazard); this.noDecor[x + k] = 1; }
    return this;
  }
  /** Pier just above the waterline, with a moored boat and the dock interaction. */
  dock(x0: number, x1: number, boatSide: -1 | 1): this {
    const y = this.sea - 1;
    for (let x = x0; x <= x1; x++) {
      this.setSpecial(x, y, SPECIAL.DOCK, Cell.OneWay); this.noDecor[x] = 1;
      for (let j = y + 1; j < this.h && !this.mat[this.i(x, j)]; j++) if (x % 2 === 0) this.special[this.i(x, j)] = SPECIAL.DOCK_POST + 1;
    }
    const bx = boatSide < 0 ? x0 - 1 : x1 + 2;
    this.props.push({ key: 'boat_side', x: bx * TILE, y: this.sea * TILE + 7, flip: boatSide < 0, front: false, sway: true });
    this.spawns.push({ t: 'dock', x: (boatSide < 0 ? x0 + 1 : x1) * TILE, y: y * TILE });
    return this;
  }
  /** Lower the terrain between x0..x1 by `depth` (basins for pools and lava). */
  notch(x0: number, x1: number, depth: number): this {
    for (let x = x0; x <= x1; x++) { const top = this.surfaceRow(x); for (let j = 0; j < depth; j++) this.set(x, top + j, M.None); this.noDecor[x] = 1; }
    return this;
  }
  /** Fill open cells in columns x0..x1 from elevation `level` downward with liquid. */
  pool(x0: number, x1: number, level: number, kind: 'water' | 'lava'): this {
    for (let x = x0; x <= x1; x++) for (let y = this.sea - level + 1; y < this.h; y++) {
      if (this.grid.cells[this.i(x, y)] === Cell.Solid) break;
      this.grid.liquid[this.i(x, y)] = kind === 'water' ? Liquid.Water : Liquid.Lava;
    }
    if (kind === 'lava') this.lights.push({ x: ((x0 + x1) / 2) * TILE, y: (this.sea - level + 1) * TILE, r: (x1 - x0 + 4) * TILE * 0.6, color: 0xff6a20 });
    return this;
  }
  /** Sea fills every open cell at/below sea level that is connected to the map edges. */
  floodSea(): this {
    const stack: number[] = [];
    for (let y = this.sea; y < this.h; y++) for (const x of [0, this.w - 1]) if (!this.grid.cells[this.i(x, y)]) stack.push(x, y);
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (!this.grid.inb(x, y) || y < this.sea) continue;
      const k = this.i(x, y);
      if (this.grid.liquid[k] || this.grid.cells[k] === Cell.Solid) continue;
      this.grid.liquid[k] = Liquid.Water;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    return this;
  }

  prop(key: string, x: number, opts: Partial<PropPlacement> & { elev?: number; dy?: number } = {}): this {
    const p = opts.elev !== undefined ? this.floorAt(x, opts.elev) : this.at(x);
    this.props.push({ key, x: p.x, y: p.y + (opts.dy ?? 0), flip: opts.flip, front: opts.front, tint: opts.tint, alpha: opts.alpha, sway: opts.sway });
    this.noDecor[Math.round(x)] = 1;
    return this;
  }
  spawn(make: (p: { x: number; y: number }, id: string) => Spawn, x: number, elev?: number): this {
    const p = elev !== undefined ? this.floorAt(x, elev) : this.at(x);
    const s = make(p, ''); this.spawns.push(make(p, this.nextId(s.t))); this.noDecor[Math.round(x)] = 1;
    return this;
  }
  habitat(species: Habitat['species'], x: number, r: number, count: number, elev?: number): this {
    const p = elev !== undefined ? this.floorAt(x, elev) : this.at(x);
    this.habitats.push({ species, x: p.x, y: p.y, r: r * TILE, count });
    return this;
  }
  wind(x: number, elevTop: number, w: number, h: number, vx: number, vy: number): this {
    this.winds.push({ x: x * TILE, y: (this.sea - elevTop) * TILE, w: w * TILE, h: h * TILE, vx, vy });
    return this;
  }
  light(x: number, elev: number, r: number, color: number): this { const p = this.px(x, elev); this.lights.push({ x: p.x, y: p.y, r, color }); return this; }

  /** Scatter biome dressing on open surfaces and inside caves. */
  decorate(density = 1): this {
    const r = this.rng, B = this.biome;
    const flat = (x: number, n: number): boolean => { const s = this.surfaceRow(x); for (let k = -n; k <= n; k++) if (Math.abs(this.surfaceRow(x + k) - s) > 0) return false; return true; };
    let lastTree = -99;
    for (let x = 3; x < this.w - 3; x++) {
      const sy = this.surfaceRow(x);
      if (sy >= this.h || this.noDecor[x] || sy > this.sea || this.grid.liquid[this.i(x, sy - 1)] || this.special[this.i(x, sy)]) continue;
      const m = this.mat[this.i(x, sy)], p = { x: x * TILE + TILE / 2, y: sy * TILE }, roll = r() / density;
      const add = (key: string, o: Partial<PropPlacement> = {}): void => { this.props.push({ key, x: p.x + Math.floor(r() * 6 - 3), y: p.y + 1, flip: r() < 0.5, ...o }); };
      if (B === 'tropical') {
        if (m === M.Sand) { if (roll < 0.07 && x - lastTree > 5) { add(r() < 0.5 ? 'palm1' : 'palm2', { sway: true }); lastTree = x; } else if (roll < 0.13) add(r() < 0.5 ? 'shell' : 'driftwood'); else if (roll < 0.17) add('rock2'); }
        else if (m === M.Earth) {
          if (roll < 0.12 && x - lastTree > 4 && flat(x, 1)) { add(r() < 0.55 ? 'tree1' : 'tree2', { front: false }); lastTree = x; }
          else if (roll < 0.26) add(r() < 0.5 ? 'bush1' : 'bush2', { front: r() < 0.3 }); else if (roll < 0.4) add('fern');
          else if (roll < 0.62) add(r() < 0.5 ? 'grass1' : 'grass2', { front: r() < 0.5 }); else if (roll < 0.72) add(['flower_red', 'flower_blue', 'flower_white'][Math.floor(r() * 3)]); else if (roll < 0.76) add('rock1');
        } else if (roll < 0.1) add(r() < 0.5 ? 'rock1' : 'rock2');
      } else if (B === 'volcanic') {
        if (roll < 0.05 && x - lastTree > 6) { add('deadtree'); lastTree = x; } else if (roll < 0.1) add(r() < 0.5 ? 'spire' : 'spire_small'); else if (roll < 0.16) add('vrock');
        else if (roll < 0.2) add('bones'); else if (roll < 0.24 && flat(x, 2)) add('basalt'); else if (roll < 0.28) add('emberbush');
      } else {
        if (roll < 0.06 && x - lastTree > 5 && flat(x, 1)) { add('pine', { sway: true }); lastTree = x; } else if (roll < 0.11) add('standing_stone'); else if (roll < 0.2) add('heather');
        else if (roll < 0.42) add('sgrass', { front: r() < 0.5 }); else if (roll < 0.47) add('srock'); else if (roll < 0.5) add('cairn');
      }
    }
    // caves: stalactites, stalagmites, crystals, glow-shrooms, vines
    for (let y = 2; y < this.h - 2; y++) for (let x = 2; x < this.w - 2; x++) {
      const k = this.i(x, y);
      if (this.grid.cells[k] || !this.bgm[k] || this.grid.liquid[k]) continue;
      const roll = r();
      if (this.grid.cells[this.i(x, y - 1)] === Cell.Solid && roll < 0.14 * density) this.props.push({ key: this.bgm[k] === BG.Rock ? 'stalactite' : 'vine2', x: x * TILE + 8, y: y * TILE + (this.bgm[k] === BG.Rock ? 20 : 32) });
      else if (this.grid.cells[this.i(x, y + 1)] === Cell.Solid && !this.grid.cells[this.i(x, y - 1)]) {
        const py = (y + 1) * TILE + 1;
        if (roll < 0.05 * density) this.props.push({ key: 'stalagmite', x: x * TILE + 8, y: py });
        else if (roll < 0.075 * density) { const key = B === 'volcanic' ? 'crystal_fire' : B === 'storm' ? 'crystal_storm' : 'crystal'; this.props.push({ key, x: x * TILE + 8, y: py }); this.lights.push({ x: x * TILE + 8, y: py - 10, r: 40, color: B === 'volcanic' ? 0xff8a40 : B === 'storm' ? 0xa090ff : 0x60e0d0 }); }
        else if (roll < 0.1 * density && B !== 'volcanic') { this.props.push({ key: 'shroom', x: x * TILE + 8, y: py }); this.lights.push({ x: x * TILE + 8, y: py - 5, r: 22, color: 0x60d0f0 }); }
      }
    }
    return this;
  }

  /** Resolve materials into tile indices (4-bit autotile + enclosed variants). */
  private autotile(): void {
    const g = this.grid, w = this.w, h = this.h;
    const sol = (x: number, y: number): boolean => x < 0 || x >= w || y >= h ? true : y < 0 ? false : this.mat[this.i(x, y)] !== 0;
    const bgs = (x: number, y: number): boolean => x < 0 || x >= w || y >= h ? true : y < 0 ? false : this.bgm[this.i(x, y)] !== 0 || this.mat[this.i(x, y)] !== 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = this.i(x, y), m = this.mat[k];
      if (m) {
        const mask = (sol(x, y - 1) ? UP : 0) | (sol(x + 1, y) ? RIGHT : 0) | (sol(x, y + 1) ? DOWN : 0) | (sol(x - 1, y) ? LEFT : 0);
        const hv = hashInts(x, y, this.seed);
        g.fg[k] = (mask === 15 ? VARIANT_BASE + (m - 1) * 4 + (hv % 4) : MAT_BASE[m] + mask) + 1;
      } else if (this.special[k]) g.fg[k] = this.special[k];
      const b = this.bgm[k];
      if (b && !m) {
        if (b === BG.Wood) { g.bg[k] = SPECIAL.BG_WOOD + 1; continue; }
        const mask = (bgs(x, y - 1) ? UP : 0) | (bgs(x + 1, y) ? RIGHT : 0) | (bgs(x, y + 1) ? DOWN : 0) | (bgs(x - 1, y) ? LEFT : 0);
        const base = b === BG.Rock ? MAT.BG_ROCK : MAT.BG_RUIN;
        g.bg[k] = (mask === 15 ? 128 + (b - 1) * 4 + (hashInts(x, y, this.seed + 5) % 4) : base + mask) + 1;
      }
    }
  }

  build(meta: { name: string; subtitle: string; startX: number; weather: WeatherId }): IslandData {
    this.autotile();
    const s = this.at(meta.startX);
    return { id: this.id, name: meta.name, subtitle: meta.subtitle, biome: this.biome, seed: this.seed, grid: this.grid, seaRow: this.sea, props: this.props, spawns: this.spawns, habitats: this.habitats, winds: this.winds, lights: this.lights, start: { x: s.x, y: s.y }, weather: meta.weather };
  }
}
