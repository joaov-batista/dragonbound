import { createWild, expressPhenotype, GeneticRegistry, generateName, breed, stageForAge, growthScale } from '../dragons/genetics/genome';
import type { DragonRecord } from '../dragons/DragonRecord';
import type { DragonGenes, Phenotype, SpeciesId, Stage } from '../dragons/genetics/types';
import { SaveManager } from '../save/SaveManager';
import { newSave, type IslandState, type SaveData } from '../save/schema';
import { hashInts, hashString } from '../utils/rng';
import type { IslandData, ItemId } from '../world/islands/types';
import { DAY_LENGTH } from './constants';
import { events } from './events';
import { settings } from './settings';

export const ITEM_NAMES: Record<ItemId, string> = { berry: 'Frutas silvestres', fish: 'Peixe', meat: 'Carne', herb: 'Erva curativa', shroom: 'Cogumelo-luz', ember: 'Cristal de brasa', shell: 'Concha brilhante', relic: 'Fragmento antigo', coin: 'Moedas' };
export const FOOD_ITEMS: ItemId[] = ['berry', 'fish', 'meat', 'herb', 'shroom', 'ember'];
export const USABLE: ItemId[] = ['berry', 'fish', 'meat', 'herb', 'shroom', 'ember', 'shell'];

/** Live session state: the save data plus caches derived from it. */
class GameState {
  save: SaveData = newSave(1);
  registry = new GeneticRegistry();
  private phCache = new Map<string, Phenotype>();

  newGame(seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0): void { this.save = newSave(seed); this.rebuild(); }
  loadFrom(s: SaveData): void { this.save = s; this.rebuild(); }
  private rebuild(): void {
    this.registry = new GeneticRegistry(); this.phCache.clear();
    for (const r of Object.values(this.save.dragons)) this.registry.register(r.genes);
  }
  async persist(): Promise<void> { await SaveManager.save(this.save); events.emit('saved'); }

  get day(): number { return this.save.day; }
  get dayFrac(): number { return this.save.day % 1; }
  /** 0 at deep night … 1 at noon. */
  get daylight(): number { return Math.max(0, Math.min(1, 0.5 - Math.cos(this.dayFrac * Math.PI * 2) * 0.75 + 0.1)); }
  get night(): boolean { return this.daylight < 0.25; }
  tick(dt: number): void { this.save.day += dt / DAY_LENGTH; this.save.playtime += dt; }

  phenotype(r: DragonRecord): Phenotype {
    let p = this.phCache.get(r.genes.id);
    if (!p) { p = expressPhenotype(r.genes); this.phCache.set(r.genes.id, p); }
    return p;
  }
  ageDays(r: DragonRecord): number { return this.save.day - r.bornDay; }
  stage(r: DragonRecord): Stage { return stageForAge(this.ageDays(r)); }
  scale(r: DragonRecord): number { return growthScale(this.ageDays(r)); }
  canRide(r: DragonRecord): boolean { return r.bonded && this.stage(r) === 'adult' && this.phenotype(r).rideable && r.hp > 0; }

  private makeRecord(genes: DragonGenes, island: string, x: number, y: number, r: number, ageDays: number): DragonRecord {
    const ph = expressPhenotype(genes);
    const rec: DragonRecord = {
      genes, name: generateName(genes.seed), bornDay: this.save.day - ageDays, hp: ph.stats.maxHp,
      hunger: 0.25 + (genes.seed % 50) / 100, energy: 0.6 + (genes.seed % 40) / 100, trust: 0, fear: 0, bonded: false, training: 0, observed: 0,
      drift: {}, memories: [], island, homeX: x, homeY: y, homeR: r, x, y, follow: false, trapped: false, injured: false, met: false,
    };
    this.save.dragons[genes.id] = rec;
    return rec;
  }

  islandState(id: string): IslandState { return (this.save.islands[id] ??= { populated: false, taken: [], regrow: {} }); }

  /** First visit: seed the island's wild population from its habitats in every lane (deterministic per world seed). */
  populate(island: IslandData): void {
    const st = this.islandState(island.id);
    const lanes = [{ depth: 0, data: island }, ...(island.lanes ?? [])];
    for (const { depth, data } of lanes) {
      const key = depth === 0 ? 'populated' : `lane${depth}`;
      if (depth === 0 ? st.populated : st.taken.includes(key)) continue;
      if (depth === 0) st.populated = true; else st.taken.push(key);
      const base = hashInts(this.save.worldSeed, hashString(data.id));
      data.habitats.forEach((h, hi) => {
        for (let i = 0; i < h.count; i++) {
          const seed = hashInts(base, hi, i);
          const genes = createWild(h.species, seed, this.registry);
          const off = ((seed % 1000) / 1000 - 0.5) * h.r;
          const rec = this.makeRecord(genes, island.id, h.x + off, h.y, h.r, 8 + (seed % 30));
          if (depth !== 0) rec.lane = depth;
        }
      });
      if (depth === 0) for (const s of data.spawns) if (s.t === 'trap') {
        const rec = this.makeRecord(this.pickRideable(s.species, hashInts(base, s.seed)), island.id, s.x, s.y, 180, 12);
        rec.trapped = true; rec.injured = true; rec.hp *= 0.35; rec.hunger = 0.85; rec.fear = 35;
      }
    }
  }
  /** The trapped dragon is the intended first mount: search seeds for an adult-sized, not-too-aggressive one. */
  private pickRideable(species: SpeciesId, seed: number): DragonGenes {
    for (let k = 0; k < 400; k++) {
      const probe = new GeneticRegistry();
      const g = createWild(species, hashInts(seed, k), probe), ph = expressPhenotype(g);
      if (ph.rideable && ph.personality.aggression < 0.5 && ph.personality.sociability > 0.5 && !this.registry.hasGenome(species, g.genotype)) { this.registry.register(g); return g; }
    }
    return createWild(species, seed, this.registry);
  }

  dragonsOn(island: string): DragonRecord[] { return Object.values(this.save.dragons).filter((r) => r.island === island); }
  get companion(): DragonRecord | null { return this.save.companion ? this.save.dragons[this.save.companion] ?? null : null; }
  bondedList(): DragonRecord[] { return Object.values(this.save.dragons).filter((r) => r.bonded); }

  // ── the party: bonded dragons that travel with the player ────────────────
  /** How many bonded dragons may follow at once (Options → Dragões seguindo). */
  get maxFollowers(): number { return Math.max(1, Math.min(6, Math.round(settings.maxFollowers ?? 3))); }
  /** Bonded dragons following the player (companion first). Kept dragons live on their own and are not in it. */
  party(): DragonRecord[] {
    const c = this.companion;
    return this.bondedList().filter((r) => r.follow && !r.kept).sort((a, b) => Number(b === c) - Number(a === c));
  }
  /** Status word for a bonded dragon. */
  partyStatus(r: DragonRecord): string {
    if (!r.bonded) return '';
    return r.kept ? 'Guardado' : r.follow ? (r === this.companion ? 'Principal' : 'Seguindo') : 'Esperando';
  }
  /** Ask a bonded dragon to follow (calls a kept one back). Returns an explanation when the party is full. */
  callBack(r: DragonRecord): string | null {
    if (!r.bonded) return null;
    const following = this.party().filter((x) => x !== r).length;
    if (following >= this.maxFollowers) return `Limite de ${this.maxFollowers} dragão(ões) seguindo. Guarde outro ou aumente o limite em Opções.`;
    const wasKept = !!r.kept;
    r.kept = false; r.follow = true;
    if (!this.companion || this.companion.kept || !this.companion.bonded) this.save.companion = r.genes.id;
    events.emit('partyChanged', { id: r.genes.id, how: wasKept ? 'summon' : 'follow' });
    return null;
  }
  /** Keep a dragon: it stops following and lives freely where it is now. */
  keep(r: DragonRecord): void {
    if (!r.bonded) return;
    r.kept = true; r.follow = false; r.homeX = r.x; r.homeY = r.y; r.homeR = Math.max(r.homeR, 220);
    if (this.save.companion === r.genes.id) this.save.companion = this.party()[0]?.genes.id ?? r.genes.id;
    events.emit('partyChanged', { id: r.genes.id, how: 'keep' });
  }
  /** Undo the bond: the dragon goes back to the wild, remembering the player kindly. */
  release(r: DragonRecord): void {
    if (!r.bonded) return;
    r.bonded = false; r.follow = false; r.kept = false; r.trust = Math.min(r.trust, 45); r.fear = 0; r.training = 0;
    r.homeX = r.x; r.homeY = r.y; r.homeR = Math.max(r.homeR, 200);
    r.memories.push({ day: this.save.day, kind: 'freed', v: 0.6 }); if (r.memories.length > 24) r.memories.shift();
    if (this.save.companion === r.genes.id) this.save.companion = this.party()[0]?.genes.id ?? this.bondedList()[0]?.genes.id ?? null;
    events.emit('partyChanged', { id: r.genes.id, how: 'release' });
  }
  /** Make sure no more than maxFollowers follow (extra ones, newest last, are kept where they stand). Returns the kept ones. */
  enforceParty(): DragonRecord[] {
    const p = this.party(), out: DragonRecord[] = [];
    for (const r of p.slice(this.maxFollowers)) { this.keep(r); out.push(r); }
    return out;
  }

  /** Lay an egg from two bonded adults of opposite sex; hatches after ~half a day. */
  layEgg(a: DragonRecord, b: DragonRecord, island: string, x: number, y: number): boolean {
    if (a.genes.sex === b.genes.sex || this.stage(a) !== 'adult' || this.stage(b) !== 'adult') return false;
    const [m, f] = a.genes.sex === 'f' ? [a, b] : [b, a];
    this.save.eggs.push({ id: `egg${this.save.eggs.length}-${Math.floor(this.save.day * 100)}`, island, x, y, hatchDay: this.save.day + 0.5, mother: m.genes.id, father: f.genes.id });
    this.save.stats.eggs++;
    return true;
  }
  /** Hatch due eggs on an island → new hatchlings that imprint on the player. */
  hatchDue(island: string): DragonRecord[] {
    const out: DragonRecord[] = [];
    this.save.eggs = this.save.eggs.filter((e) => {
      if (e.island !== island || e.hatchDay > this.save.day) return true;
      const m = this.save.dragons[e.mother], f = this.save.dragons[e.father];
      if (!m || !f) return false;
      const genes = breed(m.genes, f.genes, hashInts(this.save.worldSeed, hashString(e.id)), this.registry);
      const rec = this.makeRecord(genes, island, e.x, e.y, 160, 0.5);
      rec.trust = 55; rec.met = true; rec.observed = 0.4; rec.hunger = 0.6;
      out.push(rec);
      return false;
    });
    return out;
  }

  addItem(id: ItemId, n = 1): void {
    this.save.player.items[id] = (this.save.player.items[id] ?? 0) + n;
    if (id === 'relic') this.save.stats.relics += n;
    events.emit('hudDirty');
  }
  useItem(id: ItemId): boolean {
    if ((this.save.player.items[id] ?? 0) <= 0) return false;
    this.save.player.items[id]--; events.emit('hudDirty');
    return true;
  }
  cycleItem(dir = 1): void {
    const p = this.save.player, have = USABLE.filter((i) => (p.items[i] ?? 0) > 0);
    if (!have.length) return;
    const k = have.indexOf(p.selected);
    p.selected = have[(k + dir + have.length) % have.length];
    events.emit('hudDirty');
  }
}

export const game = new GameState();
