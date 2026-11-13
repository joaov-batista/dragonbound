import { fromHsl } from '../../art/Pix';
import { chance, clamp, gauss, hashInts, lerp, mulberry32, pick, uuidFrom, weighted, type Rng } from '../../utils/rng';
import { SPECIES } from './species';
import { CAT_LOCI, NUM_LOCI, TRAITS, type CatLocus, type DragonGenes, type Fear, type FoodId, type Genotype, type Like, type NumLocus, type Personality, type Phenotype, type SpeciesId, type Stage } from './types';

const ALL_FEARS: Fear[] = ['fire', 'water', 'storm', 'noise', 'suddenMove', 'darkness', 'crowding'];
const ALL_LIKES: Like[] = ['shiny', 'music', 'petting', 'play', 'quiet', 'warmth'];
const ALL_FOODS: FoodId[] = ['berry', 'fish', 'meat', 'herb', 'shroom', 'ember'];
const SYL_A = ['Ka', 'Ve', 'Ro', 'Sa', 'Ny', 'Tu', 'Ae', 'Io', 'Mi', 'Dra', 'Zu', 'El', 'Or', 'Bri', 'Fa', 'Lu', 'Ty', 'Gwe', 'Xa', 'Pe'];
const SYL_B = ['ra', 'len', 'thos', 'mir', 'vyn', 'ka', 'ri', 'nor', 'zel', 'dan', 'ssa', 'bru', 'lo', 'ith', 'gar', 'wen', 'ix', 'ume', 'ae', 'run'];

export function randomGenotype(species: SpeciesId, r: Rng): Genotype {
  const def = SPECIES[species];
  const num = {} as Genotype['num'], cat = {} as Genotype['cat'];
  for (const l of NUM_LOCI) {
    const [m, sd] = def.num[l] ?? [0.5, 0.16];
    num[l] = [clamp(m + gauss(r) * sd), clamp(m + gauss(r) * sd)];
  }
  for (const l of Object.keys(CAT_LOCI) as CatLocus[]) cat[l] = [weighted(r, def.cat[l]), weighted(r, def.cat[l])];
  return { num, cat };
}

/** Dominance: lower position in the species pool wins; alleles foreign to the species are recessive to native ones. */
function expressCat(species: SpeciesId, l: CatLocus, [a, b]: [number, number]): number {
  const pool = SPECIES[species].cat[l];
  const rank = (v: number): number => { const i = pool.findIndex(([x]) => x === v); return i < 0 ? 99 + v : i; };
  if (l === 'morph') return a === b ? a : Math.min(a, b) === 0 ? 0 : a; // albino/melanic only when homozygous-ish
  return rank(a) <= rank(b) ? a : b;
}

const expressNum = ([a, b]: [number, number]): number => (a + b) / 2;

/** Stable canonical hash string of a genotype (allele order within a locus is irrelevant). */
export function genomeKey(species: SpeciesId, g: Genotype): string {
  const parts: string[] = [species];
  for (const l of NUM_LOCI) { const [a, b] = g.num[l]; parts.push(`${Math.round(Math.min(a, b) * 4095).toString(36)}.${Math.round(Math.max(a, b) * 4095).toString(36)}`); }
  for (const l of Object.keys(CAT_LOCI) as CatLocus[]) { const [a, b] = g.cat[l]; parts.push(`${Math.min(a, b)}${Math.max(a, b)}`); }
  return parts.join('|');
}

export function expressPhenotype(genes: DragonGenes): Phenotype {
  const def = SPECIES[genes.species], g = genes.genotype;
  const ind = mulberry32(hashInts(genes.seed, 0x51ed));
  const n = (l: NumLocus): number => clamp(expressNum(g.num[l]) + (ind() - 0.5) * 0.05);
  const c = <L extends CatLocus>(l: L): (typeof CAT_LOCI)[L][number] => CAT_LOCI[l][expressCat(genes.species, l, g.cat[l])] as (typeof CAT_LOCI)[L][number];

  const hueSpan = (r: readonly [number, number], t: number): number => { const [a, b] = r; const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
  const morph = c('morph');
  let hue = hueSpan(def.hue, n('hue')), sat = lerp(def.sat[0], def.sat[1], n('sat')), lum = lerp(def.lum[0], def.lum[1], n('lum'));
  let hue2 = hueSpan(def.hue2, n('hue2')), lum2 = lerp(0.5, 0.78, n('lum2'));
  if (morph === 'albino') { sat *= 0.18; lum = 0.84; lum2 = 0.9; }
  if (morph === 'melanic') { sat *= 0.45; lum = 0.17; lum2 = 0.34; }
  const primary = fromHsl(hue, sat, lum);
  const secondary = fromHsl(hue2, clamp(sat * 0.75, 0.15, 0.8), lum2);
  const accent = fromHsl(hue + (n('hueAcc') - 0.5) * 150, clamp(sat + 0.1), clamp(lum + (lum > 0.48 ? -0.24 : 0.24), 0.12, 0.85));
  const eye = morph === 'albino' ? 0xe04a6a : fromHsl(n('eyeHue') * 360, 0.85, 0.62);
  const horn = n('hornTone') > 0.5 ? fromHsl(42, 0.3, lerp(0.7, 0.86, n('hornTone'))) : fromHsl(265, 0.2, lerp(0.16, 0.3, n('hornTone') * 2));

  const size = def.baseSize * lerp(0.8, 1.22, n('size'));
  const scales = c('scales');
  const personality = {} as Personality;
  for (const t of TRAITS) personality[t] = n(t);

  const resist = { ...def.resist };
  if (scales === 'plated') resist.physical = (resist.physical ?? 1) * 0.85;
  if (morph === 'albino') resist.fire = (resist.fire ?? 1) * 1.15;

  // individual quirks: deterministic from the personal seed, biased by species
  const fears: Fear[] = [], likes: Like[] = [];
  for (const f of ALL_FEARS) if (ind() < (def.fearBias.includes(f) ? 0.6 : 0.12) * lerp(1.3, 0.6, personality.courage)) fears.push(f);
  for (const l of ALL_LIKES) if (ind() < (def.likeBias.includes(l) ? 0.65 : 0.15)) likes.push(l);
  if (!likes.length) likes.push(pick(ind, def.likeBias));
  const favoriteFood = ind() < 0.8 ? pick(ind, def.foods) : pick(ind, ALL_FOODS);
  let dislikedFood = pick(ind, def.dislikes);
  if (dislikedFood === favoriteFood) dislikedFood = ALL_FOODS[(ALL_FOODS.indexOf(favoriteFood) + 3) % ALL_FOODS.length];

  return {
    species: genes.species, element: def.element, size,
    bodyLen: lerp(0.85, 1.2, n('bodyLen')), girth: lerp(0.8, 1.25, n('girth')), neckLen: lerp(0.75, 1.35, n('neckLen')),
    legLen: lerp(0.8, 1.25, n('legLen')), wingSpan: lerp(0.75, 1.3, n('wingSpan')), tailLen: lerp(0.75, 1.35, n('tailLen')),
    head: c('head'), horns: c('horns'), wings: c('wings'), tail: c('tail'), spines: c('spines'), pattern: c('pattern'), scales, eyes: c('eyes'), morph,
    primary, secondary, accent, eye, horn,
    stats: {
      maxHp: Math.round(def.baseHp * lerp(0.8, 1.25, n('vigor')) * (0.7 + size * 0.3)),
      power: Math.round(def.basePower * lerp(0.8, 1.3, n('power')) * (0.75 + size * 0.25) * 10) / 10,
      flySpeed: Math.round(def.baseFly * lerp(0.85, 1.2, n('speed')) * lerp(0.92, 1.08, n('wingSpan'))),
      agility: Math.round(def.baseAgility * lerp(0.8, 1.25, n('agility')) * 100) / 100,
      stamina: Math.round(def.baseStamina * lerp(0.8, 1.3, n('stamina'))),
    },
    resist, abilities: [...def.abilities], personality, fears, likes, favoriteFood, dislikedFood,
    rideable: size >= def.rideableMinSize, canSwim: def.canSwim,
  };
}

/** Coarse visual descriptor used to reject look-alikes within a species. */
export function visualSignature(p: Phenotype): string {
  const [h] = [Math.round(((hueOf(p.primary) % 360) / 360) * 14)];
  return [p.species, p.head, p.horns, p.wings, p.tail, p.spines, p.pattern, p.morph, h, Math.round(p.size * 5)].join(':');
}
function hueOf(c: number): number {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * Tracks every genome that exists in a save so that no two dragons share a full genetic
 * configuration, and discourages near-identical looks.
 */
export class GeneticRegistry {
  private genomes = new Set<string>();
  private ids = new Set<string>();
  private looks = new Map<string, number>();

  register(genes: DragonGenes): void {
    this.genomes.add(genomeKey(genes.species, genes.genotype));
    this.ids.add(genes.id);
    const sig = visualSignature(expressPhenotype(genes));
    this.looks.set(sig, (this.looks.get(sig) ?? 0) + 1);
  }
  hasGenome(species: SpeciesId, g: Genotype): boolean { return this.genomes.has(genomeKey(species, g)); }
  hasId(id: string): boolean { return this.ids.has(id); }
  lookCount(sig: string): number { return this.looks.get(sig) ?? 0; }
  get size(): number { return this.ids.size; }
}

export interface CreateOpts { sex?: 'f' | 'm'; line?: string }

/** Deterministically create a wild dragon from a seed; retries until unique in the registry. */
export function createWild(species: SpeciesId, seed: number, reg: GeneticRegistry, opts: CreateOpts = {}): DragonGenes {
  for (let attempt = 0; ; attempt++) {
    const s = attempt === 0 ? seed >>> 0 : hashInts(seed, attempt);
    const r = mulberry32(s);
    const genotype = randomGenotype(species, r);
    const genes: DragonGenes = {
      id: uuidFrom(r), seed: s, species, sex: opts.sex ?? (r() < 0.5 ? 'f' : 'm'), genotype,
      lineage: { generation: 0, mother: null, father: null, line: opts.line ?? pick(r, SYL_A) + pick(r, SYL_B) },
    };
    if (reg.hasGenome(species, genotype) || reg.hasId(genes.id)) continue;
    if (attempt < 12 && reg.lookCount(visualSignature(expressPhenotype(genes))) > 0) continue;
    reg.register(genes);
    return genes;
  }
}

export function generateName(seed: number): string {
  const r = mulberry32(hashInts(seed, 0x9a3e));
  const base = pick(r, SYL_A) + pick(r, SYL_B);
  return chance(r, 0.3) ? base + pick(r, SYL_B) : base;
}

export interface BreedOpts { mutationRate?: number }

/** Sexual reproduction: one allele per locus from each parent, with mutation. Never yields a clone. */
export function breed(mother: DragonGenes, father: DragonGenes, seed: number, reg: GeneticRegistry, opts: BreedOpts = {}): DragonGenes {
  const mut = opts.mutationRate ?? 0.08;
  const species = mother.species; // hatchlings take the mother's species; foreign alleles stay recessive
  const def = SPECIES[species];
  const parentKeys = new Set([genomeKey(mother.species, mother.genotype), genomeKey(father.species, father.genotype)]);
  for (let attempt = 0; ; attempt++) {
    const s = hashInts(seed, attempt, 0xb4eed);
    const r = mulberry32(s);
    const num = {} as Genotype['num'], cat = {} as Genotype['cat'];
    for (const l of NUM_LOCI) {
      const a = mother.genotype.num[l][r() < 0.5 ? 0 : 1], b = father.genotype.num[l][r() < 0.5 ? 0 : 1];
      const m = (v: number): number => clamp(chance(r, mut) ? v + gauss(r) * 0.09 : v + gauss(r) * 0.004);
      num[l] = [m(a), m(b)];
    }
    for (const l of Object.keys(CAT_LOCI) as CatLocus[]) {
      const m = (v: number): number => (chance(r, mut * 0.5) ? (chance(r, 0.8) ? weighted(r, def.cat[l]) : Math.floor(r() * CAT_LOCI[l].length)) : v);
      cat[l] = [m(mother.genotype.cat[l][r() < 0.5 ? 0 : 1]), m(father.genotype.cat[l][r() < 0.5 ? 0 : 1])];
    }
    const genotype = { num, cat };
    const key = genomeKey(species, genotype);
    if (parentKeys.has(key) || reg.hasGenome(species, genotype)) continue;
    const genes: DragonGenes = {
      id: uuidFrom(r), seed: s, species, sex: r() < 0.5 ? 'f' : 'm', genotype,
      lineage: { generation: Math.max(mother.lineage.generation, father.lineage.generation) + 1, mother: mother.id, father: father.id, line: mother.lineage.line },
    };
    if (reg.hasId(genes.id)) continue;
    reg.register(genes);
    return genes;
  }
}

/** Growth: age in in-game days → life stage and body scale multiplier. */
export const STAGE_DAYS = { egg: 0.5, hatchling: 2, juvenile: 5 } as const;
export function stageForAge(days: number): Stage {
  if (days < STAGE_DAYS.egg) return 'egg';
  if (days < STAGE_DAYS.hatchling) return 'hatchling';
  if (days < STAGE_DAYS.juvenile) return 'juvenile';
  return 'adult';
}
export function growthScale(days: number): number {
  if (days < STAGE_DAYS.egg) return 0.3;
  if (days < STAGE_DAYS.hatchling) return lerp(0.38, 0.55, (days - STAGE_DAYS.egg) / (STAGE_DAYS.hatchling - STAGE_DAYS.egg));
  if (days < STAGE_DAYS.juvenile) return lerp(0.55, 0.95, (days - STAGE_DAYS.hatchling) / (STAGE_DAYS.juvenile - STAGE_DAYS.hatchling));
  return 1;
}
