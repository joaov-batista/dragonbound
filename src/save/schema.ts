import { SAVE_VERSION } from '../core/constants';
import type { DragonRecord } from '../dragons/DragonRecord';
import type { ItemId } from '../world/islands/types';

export interface IslandState { populated: boolean; taken: string[]; regrow: Record<string, number> }
export interface SaveData {
  version: number; worldSeed: number; day: number; playtime: number; savedAt: number;
  player: { island: string; lane?: number; x: number; y: number; hp: number; maxHp: number; items: Record<ItemId, number>; selected: ItemId; checkpoint: { island: string; x: number; y: number; lane?: number } };
  dragons: Record<string, DragonRecord>;
  companion: string | null;
  islands: Record<string, IslandState>;
  ocean: { x: number; y: number; atSea: boolean; flying: boolean; discovered: string[]; boatHp: number };
  stats: { relics: number; bonded: number; flights: number; eggs: number };
  eggs: { id: string; island: string; x: number; y: number; hatchDay: number; mother: string; father: string }[];
}

export function newSave(worldSeed: number): SaveData {
  return {
    version: SAVE_VERSION, worldSeed, day: 0.3, playtime: 0, savedAt: Date.now(),
    player: { island: 'alvamar', x: -1, y: -1, hp: 6, maxHp: 6, items: { berry: 3, fish: 1, meat: 0, herb: 1, shroom: 0, ember: 0, shell: 0, relic: 0 }, selected: 'berry', checkpoint: { island: 'alvamar', x: -1, y: -1 } },
    dragons: {}, companion: null, islands: {},
    ocean: { x: 1500, y: 3140, atSea: false, flying: false, discovered: ['alvamar'], boatHp: 100 },
    stats: { relics: 0, bonded: 0, flights: 0, eggs: 0 }, eggs: [],
  };
}

type Migration = (d: Record<string, unknown>) => void;
/** migrations[n] upgrades a save from version n to n+1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 (first playable) had no eggs, no boat hull and stored relics inside the inventory only.
  1: (d) => {
    const s = d as unknown as SaveData;
    s.eggs = s.eggs ?? [];
    s.ocean = { ...{ x: 1500, y: 3140, atSea: false, flying: false, discovered: ['alvamar'], boatHp: 100 }, ...(s.ocean ?? {}) };
    s.stats = { ...{ relics: s.player?.items?.relic ?? 0, bonded: 0, flights: 0, eggs: 0 }, ...(s.stats ?? {}) };
    for (const r of Object.values(s.dragons ?? {})) { r.training = r.training ?? 0; r.observed = r.observed ?? 0; r.drift = r.drift ?? {}; r.memories = r.memories ?? []; }
  },
};

export class SaveVersionError extends Error {}

/** Upgrade any older save to the current schema; throws on saves from the future. */
export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveVersionError('save vazio ou inválido');
  const d = raw as Record<string, unknown>;
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new SaveVersionError(`save da versão ${v} é mais novo que o jogo (${SAVE_VERSION})`);
  while (v < SAVE_VERSION) { MIGRATIONS[v]?.(d); v++; d.version = v; }
  const s = d as unknown as SaveData;
  if (!s.player || !s.dragons || typeof s.worldSeed !== 'number') throw new SaveVersionError('save corrompido');
  return s;
}
