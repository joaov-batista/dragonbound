import type { CatLocus, Element, FoodId, NumLocus, SpeciesId, Fear, Like } from './types';

/** Allele pool for a categorical locus: [alleleIndex, frequency]. Order = dominance (first is most dominant). */
type Pool = ReadonlyArray<readonly [number, number]>;

export interface SpeciesDef {
  id: SpeciesId; name: string; element: Element; blurb: string;
  /** mean and spread of allele values per numeric locus (default 0.5 / 0.16). */
  num: Partial<Record<NumLocus, readonly [number, number]>>;
  cat: Record<CatLocus, Pool>;
  hue: readonly [number, number]; hue2: readonly [number, number]; sat: readonly [number, number]; lum: readonly [number, number];
  baseSize: number; baseHp: number; basePower: number; baseFly: number; baseAgility: number; baseStamina: number;
  resist: Partial<Record<Element | 'physical', number>>;
  abilities: string[]; foods: readonly FoodId[]; dislikes: readonly FoodId[];
  fearBias: readonly Fear[]; likeBias: readonly Like[];
  rideableMinSize: number; canSwim: boolean; habitat: string;
}

// index helpers (see CAT_LOCI order)
const H = { wedge: 0, blunt: 1, long: 2, crest: 3 }, HO = { none: 0, swept: 1, curled: 2, spikes: 3, antler: 4 };
const W = { bat: 0, feather: 1, fin: 2, leaf: 3 }, T = { whip: 0, club: 1, fan: 2, spade: 3, fork: 4 };
const SP = { none: 0, ridge: 1, plates: 2, frill: 3 }, P = { none: 0, stripes: 1, spots: 2, saddle: 3, bands: 4, speckle: 5 };
const SC = { smooth: 0, plated: 1, rough: 2 }, E = { round: 0, slit: 1, glow: 2 };
const MORPH: Pool = [[0, 0.94], [2, 0.035], [1, 0.025]]; // normal dominant; melanic, albino recessive

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  cinzal: {
    id: 'cinzal', name: 'Cinzal', element: 'fire', blurb: 'Dragão das encostas vulcânicas. Robusto, orgulhoso e guloso por cristais de brasa.',
    num: { size: [0.62, 0.14], girth: [0.64, 0.12], aggression: [0.6, 0.18], courage: [0.68, 0.15], territoriality: [0.66, 0.16], power: [0.66, 0.14], sociability: [0.36, 0.16] },
    cat: { head: [[H.wedge, 0.6], [H.blunt, 0.3], [H.crest, 0.1]], horns: [[HO.swept, 0.5], [HO.spikes, 0.3], [HO.curled, 0.2]], wings: [[W.bat, 1]], tail: [[T.spade, 0.5], [T.club, 0.3], [T.whip, 0.2]], spines: [[SP.ridge, 0.5], [SP.plates, 0.35], [SP.none, 0.15]], pattern: [[P.saddle, 0.35], [P.none, 0.25], [P.stripes, 0.2], [P.speckle, 0.2]], scales: [[SC.plated, 0.5], [SC.rough, 0.4], [SC.smooth, 0.1]], eyes: [[E.slit, 0.7], [E.glow, 0.3]], morph: MORPH },
    hue: [350, 34], hue2: [20, 60], sat: [0.55, 0.85], lum: [0.3, 0.5],
    baseSize: 1.12, baseHp: 130, basePower: 16, baseFly: 150, baseAgility: 0.8, baseStamina: 100,
    resist: { fire: 0.25, ice: 1.2, water: 1.6, physical: 0.9 }, abilities: ['fireBreath', 'heatProof'], foods: ['ember', 'meat'], dislikes: ['fish', 'herb'],
    fearBias: ['water', 'crowding'], likeBias: ['warmth', 'shiny'], rideableMinSize: 0.95, canSwim: false, habitat: 'volcanic',
  },
  marulho: {
    id: 'marulho', name: 'Marulho', element: 'water', blurb: 'Dragão das enseadas. Nada tão bem quanto voa e adora companhia.',
    num: { sociability: [0.7, 0.14], curiosity: [0.62, 0.16], aggression: [0.3, 0.14], neckLen: [0.62, 0.12], tailLen: [0.66, 0.12], stamina: [0.62, 0.13], loyalty: [0.62, 0.15] },
    cat: { head: [[H.long, 0.55], [H.wedge, 0.3], [H.crest, 0.15]], horns: [[HO.none, 0.45], [HO.swept, 0.35], [HO.antler, 0.2]], wings: [[W.fin, 1]], tail: [[T.fan, 0.6], [T.fork, 0.25], [T.whip, 0.15]], spines: [[SP.frill, 0.55], [SP.ridge, 0.25], [SP.none, 0.2]], pattern: [[P.bands, 0.3], [P.spots, 0.3], [P.none, 0.2], [P.stripes, 0.2]], scales: [[SC.smooth, 0.75], [SC.plated, 0.25]], eyes: [[E.round, 0.8], [E.slit, 0.2]], morph: MORPH },
    hue: [170, 235], hue2: [150, 200], sat: [0.5, 0.8], lum: [0.4, 0.58],
    baseSize: 1.0, baseHp: 100, basePower: 11, baseFly: 165, baseAgility: 1.0, baseStamina: 120,
    resist: { water: 0.25, fire: 0.6, storm: 1.6, physical: 1 }, abilities: ['waterJet', 'swimmer'], foods: ['fish', 'berry'], dislikes: ['ember', 'meat'],
    fearBias: ['fire', 'noise'], likeBias: ['play', 'music', 'petting'], rideableMinSize: 0.9, canSwim: true, habitat: 'coast',
  },
  folhasca: {
    id: 'folhasca', name: 'Folhasca', element: 'nature', blurb: 'Pequeno dragão das copas. Curioso, brincalhão e difícil de enxergar entre as folhas.',
    num: { size: [0.34, 0.12], curiosity: [0.74, 0.13], courage: [0.42, 0.18], agility: [0.7, 0.12], sociability: [0.6, 0.16], aggression: [0.26, 0.14], sensitivity: [0.62, 0.15] },
    cat: { head: [[H.blunt, 0.5], [H.crest, 0.3], [H.wedge, 0.2]], horns: [[HO.antler, 0.45], [HO.none, 0.3], [HO.curled, 0.25]], wings: [[W.leaf, 0.8], [W.feather, 0.2]], tail: [[T.whip, 0.4], [T.fork, 0.3], [T.fan, 0.3]], spines: [[SP.none, 0.4], [SP.frill, 0.3], [SP.ridge, 0.3]], pattern: [[P.spots, 0.3], [P.speckle, 0.3], [P.stripes, 0.2], [P.none, 0.2]], scales: [[SC.smooth, 0.6], [SC.rough, 0.4]], eyes: [[E.round, 0.9], [E.glow, 0.1]], morph: MORPH },
    hue: [75, 150], hue2: [30, 70], sat: [0.45, 0.75], lum: [0.38, 0.55],
    baseSize: 0.78, baseHp: 70, basePower: 8, baseFly: 150, baseAgility: 1.25, baseStamina: 90,
    resist: { nature: 0.3, earth: 0.7, fire: 1.7, ice: 1.3 }, abilities: ['sporeCloud', 'camouflage'], foods: ['berry', 'shroom', 'herb'], dislikes: ['meat', 'ember'],
    fearBias: ['fire', 'suddenMove', 'noise'], likeBias: ['play', 'quiet', 'shiny'], rideableMinSize: 1.2, canSwim: false, habitat: 'forest',
  },
  trovisco: {
    id: 'trovisco', name: 'Trovisco', element: 'storm', blurb: 'Dragão esguio das falésias tempestuosas. O mais veloz do arquipélago — e o mais arisco.',
    num: { speed: [0.76, 0.1], agility: [0.66, 0.12], independence: [0.7, 0.14], girth: [0.36, 0.1], wingSpan: [0.72, 0.1], bodyLen: [0.62, 0.1], courage: [0.6, 0.16], sociability: [0.38, 0.16], sensitivity: [0.6, 0.14] },
    cat: { head: [[H.long, 0.45], [H.crest, 0.35], [H.wedge, 0.2]], horns: [[HO.swept, 0.55], [HO.antler, 0.25], [HO.none, 0.2]], wings: [[W.feather, 0.75], [W.bat, 0.25]], tail: [[T.fork, 0.45], [T.whip, 0.35], [T.spade, 0.2]], spines: [[SP.ridge, 0.4], [SP.frill, 0.35], [SP.none, 0.25]], pattern: [[P.stripes, 0.4], [P.bands, 0.25], [P.none, 0.2], [P.speckle, 0.15]], scales: [[SC.smooth, 0.7], [SC.plated, 0.3]], eyes: [[E.glow, 0.55], [E.slit, 0.45]], morph: MORPH },
    hue: [225, 285], hue2: [45, 60], sat: [0.35, 0.7], lum: [0.4, 0.62],
    baseSize: 1.05, baseHp: 90, basePower: 13, baseFly: 215, baseAgility: 1.15, baseStamina: 110,
    resist: { storm: 0.2, water: 0.8, earth: 1.5, physical: 1.1 }, abilities: ['lightningBolt', 'stormRider'], foods: ['fish', 'meat'], dislikes: ['shroom', 'herb'],
    fearBias: ['crowding', 'darkness'], likeBias: ['quiet', 'music'], rideableMinSize: 0.92, canSwim: false, habitat: 'cliffs',
  },
  pedrusco: {
    id: 'pedrusco', name: 'Pedrusco', element: 'earth', blurb: 'Dragão das cavernas, pesado e paciente. Voa pouco, mas nada o derruba.',
    num: { size: [0.66, 0.13], girth: [0.76, 0.1], legLen: [0.36, 0.1], wingSpan: [0.32, 0.1], vigor: [0.74, 0.11], speed: [0.28, 0.1], courage: [0.62, 0.15], curiosity: [0.36, 0.15], protectiveness: [0.68, 0.14], aggression: [0.42, 0.16] },
    cat: { head: [[H.blunt, 0.65], [H.wedge, 0.35]], horns: [[HO.curled, 0.45], [HO.spikes, 0.35], [HO.none, 0.2]], wings: [[W.bat, 1]], tail: [[T.club, 0.65], [T.whip, 0.2], [T.spade, 0.15]], spines: [[SP.plates, 0.6], [SP.ridge, 0.25], [SP.none, 0.15]], pattern: [[P.speckle, 0.35], [P.none, 0.3], [P.saddle, 0.2], [P.spots, 0.15]], scales: [[SC.rough, 0.5], [SC.plated, 0.5]], eyes: [[E.round, 0.5], [E.slit, 0.3], [E.glow, 0.2]], morph: MORPH },
    hue: [18, 50], hue2: [150, 200], sat: [0.18, 0.45], lum: [0.32, 0.5],
    baseSize: 1.15, baseHp: 170, basePower: 15, baseFly: 115, baseAgility: 0.62, baseStamina: 70,
    resist: { earth: 0.3, physical: 0.65, storm: 0.6, water: 1.4, nature: 1.3 }, abilities: ['quakeStomp', 'stoneHide'], foods: ['shroom', 'meat'], dislikes: ['fish', 'berry'],
    fearBias: ['storm', 'water'], likeBias: ['quiet', 'petting', 'warmth'], rideableMinSize: 0.95, canSwim: false, habitat: 'cave',
  },
  geadino: {
    id: 'geadino', name: 'Geadino', element: 'ice', blurb: 'Dragão das ilhotas frias. Sereno e observador, sopra uma geada que cristaliza o ar.',
    num: { intelligence: [0.7, 0.13], sensitivity: [0.64, 0.14], aggression: [0.34, 0.15], neckLen: [0.64, 0.12], loyalty: [0.66, 0.14], independence: [0.56, 0.16] },
    cat: { head: [[H.crest, 0.5], [H.long, 0.3], [H.wedge, 0.2]], horns: [[HO.antler, 0.4], [HO.spikes, 0.35], [HO.swept, 0.25]], wings: [[W.feather, 0.6], [W.fin, 0.4]], tail: [[T.fan, 0.4], [T.spade, 0.3], [T.whip, 0.3]], spines: [[SP.frill, 0.4], [SP.plates, 0.3], [SP.ridge, 0.3]], pattern: [[P.none, 0.3], [P.speckle, 0.3], [P.saddle, 0.2], [P.bands, 0.2]], scales: [[SC.smooth, 0.5], [SC.plated, 0.5]], eyes: [[E.glow, 0.5], [E.round, 0.5]], morph: MORPH },
    hue: [180, 215], hue2: [200, 280], sat: [0.2, 0.5], lum: [0.6, 0.78],
    baseSize: 1.0, baseHp: 105, basePower: 12, baseFly: 160, baseAgility: 0.95, baseStamina: 100,
    resist: { ice: 0.2, water: 0.7, fire: 1.7 }, abilities: ['frostBreath', 'coldProof'], foods: ['fish', 'herb'], dislikes: ['ember', 'shroom'],
    fearBias: ['fire', 'noise'], likeBias: ['quiet', 'music', 'shiny'], rideableMinSize: 0.92, canSwim: true, habitat: 'islet',
  },
  breu: {
    id: 'breu', name: 'Breu', element: 'storm', blurb: 'Dragão raro da noite: negro como carvão, olhos que brilham, o voo mais rápido de todos. Só aparece depois do pôr do sol, no alto da montanha, e foge de qualquer barulho.',
    num: { speed: [0.86, 0.06], agility: [0.8, 0.08], independence: [0.74, 0.12], girth: [0.42, 0.08], wingSpan: [0.82, 0.08], bodyLen: [0.6, 0.08], courage: [0.5, 0.16], sociability: [0.3, 0.14], sensitivity: [0.78, 0.1], intelligence: [0.8, 0.1], loyalty: [0.78, 0.1], size: [0.56, 0.08] },
    cat: { head: [[H.wedge, 0.6], [H.blunt, 0.4]], horns: [[HO.none, 0.6], [HO.swept, 0.4]], wings: [[W.bat, 1]], tail: [[T.fork, 0.55], [T.fan, 0.45]], spines: [[SP.ridge, 0.5], [SP.none, 0.5]], pattern: [[P.none, 0.7], [P.speckle, 0.3]], scales: [[SC.smooth, 0.8], [SC.plated, 0.2]], eyes: [[E.glow, 1]], morph: [[0, 1]] },
    hue: [235, 275], hue2: [250, 290], sat: [0.12, 0.3], lum: [0.09, 0.16],
    baseSize: 1.0, baseHp: 120, basePower: 19, baseFly: 240, baseAgility: 1.25, baseStamina: 140,
    resist: { storm: 0.3, fire: 0.8, physical: 1.0 }, abilities: ['plasmaBlast', 'nightFlight'], foods: ['fish'], dislikes: ['berry', 'shroom'],
    fearBias: ['noise', 'crowding', 'suddenMove'], likeBias: ['quiet', 'petting', 'play'], rideableMinSize: 0.9, canSwim: false, habitat: 'peak',
  },
};
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
