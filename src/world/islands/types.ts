import type { BiomeId } from '../../art/themes';
import type { EnemyKind } from '../../art/enemies';
import type { SpeciesId } from '../../dragons/genetics/types';
import type { TileGrid } from '../../physics/TileGrid';

export type ItemId = 'berry' | 'fish' | 'meat' | 'herb' | 'shroom' | 'ember' | 'shell' | 'relic' | 'coin';
export interface PropPlacement { key: string; x: number; y: number; flip?: boolean; front?: boolean; tint?: number; alpha?: number; sway?: boolean }
export type Spawn =
  | { t: 'enemy'; kind: EnemyKind; x: number; y: number }
  | { t: 'pickup'; item: ItemId; x: number; y: number; id: string; secret?: string }
  | { t: 'npc'; who: string; x: number; y: number; range: number }
  | { t: 'boss'; boss: 'bruto' | 'alpha'; x: number; y: number; arena: [number, number] }
  | { t: 'trigger'; flag: string; x0: number; x1: number }
  | { t: 'bush'; x: number; y: number; id: string }
  | { t: 'campfire'; x: number; y: number; id: string }
  | { t: 'chest'; x: number; y: number; id: string; loot: ItemId; n: number }
  | { t: 'dock'; x: number; y: number }
  | { t: 'sign'; x: number; y: number; text: string }
  | { t: 'torch'; x: number; y: number }
  | { t: 'trap'; x: number; y: number; id: string; species: SpeciesId; seed: number }
  | { t: 'fishspot'; x: number; y: number; id: string }
  | { t: 'nest'; x: number; y: number; id: string }
  | { t: 'waterfall'; x: number; y: number; h: number }
  | { t: 'vent'; x: number; y: number };
export interface Habitat { species: SpeciesId; x: number; y: number; r: number; count: number }
export interface WindZone { x: number; y: number; w: number; h: number; vx: number; vy: number }
export interface LightDef { x: number; y: number; r: number; color: number }
export type WeatherId = 'clear' | 'rain' | 'storm' | 'ash';

export interface IslandData {
  id: string; name: string; subtitle: string; biome: BiomeId; seed: number;
  grid: TileGrid; seaRow: number;
  props: PropPlacement[]; spawns: Spawn[]; habitats: Habitat[]; winds: WindZone[]; lights: LightDef[];
  start: { x: number; y: number }; weather: WeatherId;
  /** Authored adjustments for the generated side lanes (village streets, secrets…). */
  laneHooks?: Partial<Record<-1 | 1, LaneHook>>;
  /** Parallel depth lanes at the same location (-1 = background, +1 = foreground). The island itself is lane 0. */
  lanes?: { depth: number; data: IslandData }[];
}

export interface LaneHook { reserve?: [number, number]; heights?: (h: number[]) => void; build?: (b: import('./IslandBuilder').IslandBuilder) => void }
