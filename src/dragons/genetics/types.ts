export type SpeciesId = 'cinzal' | 'marulho' | 'folhasca' | 'trovisco' | 'pedrusco' | 'geadino' | 'breu';
export type Element = 'fire' | 'water' | 'nature' | 'storm' | 'earth' | 'ice';

export const HEADS = ['wedge', 'blunt', 'long', 'crest'] as const;
export const HORNS = ['none', 'swept', 'curled', 'spikes', 'antler'] as const;
export const WINGS = ['bat', 'feather', 'fin', 'leaf'] as const;
export const TAILS = ['whip', 'club', 'fan', 'spade', 'fork'] as const;
export const SPINES = ['none', 'ridge', 'plates', 'frill'] as const;
export const PATTERNS = ['none', 'stripes', 'spots', 'saddle', 'bands', 'speckle'] as const;
export const SCALES = ['smooth', 'plated', 'rough'] as const;
export const EYES = ['round', 'slit', 'glow'] as const;
export const MORPHS = ['normal', 'albino', 'melanic'] as const;

/** Categorical loci: allele = index into the list above. Dominance = species-specific order. */
export const CAT_LOCI = { head: HEADS, horns: HORNS, wings: WINGS, tail: TAILS, spines: SPINES, pattern: PATTERNS, scales: SCALES, eyes: EYES, morph: MORPHS } as const;
export type CatLocus = keyof typeof CAT_LOCI;

/** Continuous loci: alleles are numbers in [0,1], expressed with incomplete dominance. */
export const NUM_LOCI = [
  'size', 'bodyLen', 'girth', 'neckLen', 'legLen', 'wingSpan', 'tailLen',
  'hue', 'sat', 'lum', 'hue2', 'lum2', 'hueAcc', 'eyeHue', 'hornTone',
  'vigor', 'power', 'speed', 'agility', 'stamina',
  'courage', 'curiosity', 'aggression', 'intelligence', 'sociability',
  'independence', 'territoriality', 'loyalty', 'sensitivity', 'protectiveness',
] as const;
export type NumLocus = (typeof NUM_LOCI)[number];

export const TRAITS = ['courage', 'curiosity', 'aggression', 'intelligence', 'sociability', 'independence', 'territoriality', 'loyalty', 'sensitivity', 'protectiveness'] as const;
export type Trait = (typeof TRAITS)[number];
export type Personality = Record<Trait, number>;

export interface Genotype {
  num: Record<NumLocus, [number, number]>;
  cat: Record<CatLocus, [number, number]>;
}

export type Sex = 'f' | 'm';
export type Stage = 'egg' | 'hatchling' | 'juvenile' | 'adult';
export type Fear = 'fire' | 'water' | 'storm' | 'noise' | 'suddenMove' | 'darkness' | 'crowding';
export type Like = 'shiny' | 'music' | 'petting' | 'play' | 'quiet' | 'warmth';
export type FoodId = 'berry' | 'fish' | 'meat' | 'herb' | 'shroom' | 'ember';

/** Expressed traits — always recomputed from genotype + seed, never stored. */
export interface Phenotype {
  species: SpeciesId; element: Element;
  size: number; bodyLen: number; girth: number; neckLen: number; legLen: number; wingSpan: number; tailLen: number;
  head: (typeof HEADS)[number]; horns: (typeof HORNS)[number]; wings: (typeof WINGS)[number]; tail: (typeof TAILS)[number];
  spines: (typeof SPINES)[number]; pattern: (typeof PATTERNS)[number]; scales: (typeof SCALES)[number]; eyes: (typeof EYES)[number];
  morph: (typeof MORPHS)[number];
  primary: number; secondary: number; accent: number; eye: number; horn: number;
  stats: { maxHp: number; power: number; flySpeed: number; agility: number; stamina: number };
  resist: Partial<Record<Element | 'physical', number>>; // damage multipliers (<1 resist, >1 weak)
  abilities: string[];
  personality: Personality; // innate baseline
  fears: Fear[]; likes: Like[]; favoriteFood: FoodId; dislikedFood: FoodId;
  rideable: boolean; canSwim: boolean;
}

export interface Lineage { generation: number; mother: string | null; father: string | null; line: string }

export interface DragonGenes {
  id: string; seed: number; species: SpeciesId; sex: Sex; genotype: Genotype; lineage: Lineage;
}
