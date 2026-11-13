import type { DragonGenes, Personality, Trait } from './genetics/types';
import { TRAITS } from './genetics/types';
import { clamp } from '../utils/rng';

export type BondStage = 'wild' | 'wary' | 'curious' | 'trusting' | 'bonded';
export const STAGE_LABEL: Record<BondStage, string> = { wild: 'Arisco', wary: 'Desconfiado', curious: 'Curioso', trusting: 'Confiante', bonded: 'Vinculado' };

export type MemoryKind = 'fed' | 'fedDisliked' | 'pet' | 'petTooSoon' | 'startled' | 'hurtByHuman' | 'freed' | 'healed' | 'respected' | 'played' | 'observed' | 'calmed' | 'bonded' | 'noise' | 'music' | 'foughtTogether' | 'flew';
export interface Memory { day: number; kind: MemoryKind; v: number }

/** Everything persisted about one individual. The phenotype is re-derived from `genes`. */
export interface DragonRecord {
  genes: DragonGenes; name: string; bornDay: number;
  hp: number; hunger: number; energy: number;
  trust: number; fear: number; bonded: boolean; training: number; observed: number;
  drift: Partial<Record<Trait, number>>; memories: Memory[];
  island: string; /** depth lane on that island (-1 back, 0 main, 1 front); absent = 0 */ lane?: number; homeX: number; homeY: number; homeR: number; x: number; y: number;
  follow: boolean; trapped: boolean; injured: boolean; met: boolean; eggOf?: string;
  /** bonded but "kept": stops following and lives on its own where it was left, until called back from the menu */ kept?: boolean;
}

export function bondStage(r: DragonRecord): BondStage {
  if (r.bonded) return 'bonded';
  return r.trust < 15 ? 'wild' : r.trust < 35 ? 'wary' : r.trust < 60 ? 'curious' : 'trusting';
}

/** Innate personality shifted by lived experience. */
export function effectiveTraits(innate: Personality, r: DragonRecord): Personality {
  const out = {} as Personality;
  for (const t of TRAITS) out[t] = clamp(innate[t] + (r.drift[t] ?? 0));
  return out;
}

export function remember(r: DragonRecord, day: number, kind: MemoryKind, v: number): void {
  r.memories.push({ day, kind, v });
  if (r.memories.length > 24) r.memories.shift();
}

export function nudge(r: DragonRecord, t: Trait, d: number): void {
  r.drift[t] = Math.max(-0.35, Math.min(0.35, (r.drift[t] ?? 0) + d));
}

/** How the dragon feels about humans overall, from decayed memories (-1..1). */
export function humanAffinity(r: DragonRecord, day: number): number {
  let s = 0;
  for (const m of r.memories) s += m.v * Math.exp(-(day - m.day) / 6);
  return Math.max(-1, Math.min(1, s / 40));
}
