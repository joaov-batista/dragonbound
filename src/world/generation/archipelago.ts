import type { BiomeId } from '../../art/themes';
import { hashInts, mulberry32 } from '../../utils/rng';
import { buildStarter } from '../islands/starter';
import { buildStorm } from '../islands/storm';
import { buildVolcanic } from '../islands/volcanic';
import type { IslandData } from '../islands/types';
import { generateIsland, isletName } from './proceduralIsland';

/** Ocean-scale description of an island (top-down map units = pixels of the ocean scene). */
export interface IslandSite { id: string; name: string; biome: BiomeId; x: number; y: number; r: number; seed: number; main: boolean }

export const OCEAN_W = 6400, OCEAN_H = 4400, CHUNK = 640;
export const MAIN_SITES: IslandSite[] = [
  { id: 'alvamar', name: 'Alvamar', biome: 'tropical', x: 1500, y: 2900, r: 210, seed: 1107, main: true },
  { id: 'brasaviva', name: 'Monte Brasaviva', biome: 'volcanic', x: 4700, y: 3100, r: 190, seed: 2203, main: true },
  { id: 'trovao', name: 'Agulhas do Trovão', biome: 'storm', x: 3300, y: 900, r: 180, seed: 3301, main: true },
];

/** Regional biome: nearest main island wins, so climates stay spatially coherent. */
export function biomeAt(x: number, y: number): BiomeId {
  let best = MAIN_SITES[0], bd = Infinity;
  for (const s of MAIN_SITES) { const d = Math.hypot(x - s.x, y - s.y); if (d < bd) { bd = d; best = s; } }
  return best.biome;
}

/** Deterministic islet for an ocean chunk (or null). Pure function of (worldSeed, cx, cy). */
export function isletInChunk(worldSeed: number, cx: number, cy: number): IslandSite | null {
  const seed = hashInts(worldSeed, cx, cy, 0x15e7);
  const r = mulberry32(seed);
  if (r() > 0.34) return null;
  const x = cx * CHUNK + 150 + r() * (CHUNK - 300), y = cy * CHUNK + 150 + r() * (CHUNK - 300);
  if (x < 300 || y < 300 || x > OCEAN_W - 300 || y > OCEAN_H - 300) return null;
  for (const s of MAIN_SITES) if (Math.hypot(x - s.x, y - s.y) < s.r + 520) return null;
  const biome = biomeAt(x, y);
  return { id: `islet-${seed.toString(36)}`, name: isletName(seed, biome), biome, x, y, r: 70 + r() * 40, seed, main: false };
}

export function allSites(worldSeed: number): IslandSite[] {
  const out = [...MAIN_SITES];
  for (let cy = 0; cy < Math.ceil(OCEAN_H / CHUNK); cy++) for (let cx = 0; cx < Math.ceil(OCEAN_W / CHUNK); cx++) { const s = isletInChunk(worldSeed, cx, cy); if (s) out.push(s); }
  return out;
}
export function siteById(worldSeed: number, id: string): IslandSite | undefined { return allSites(worldSeed).find((s) => s.id === id); }

/** Build (or rebuild) the explorable side-view island for a site. Only one is in memory at a time. */
export function loadIsland(site: IslandSite): IslandData {
  switch (site.id) {
    case 'alvamar': return buildStarter();
    case 'brasaviva': return buildVolcanic();
    case 'trovao': return buildStorm();
    default: { const d = generateIsland(site.seed, site.biome); d.id = site.id; return d; }
  }
}

/** Steady ocean current (px/s) from a few large gyres + drift toward the east. */
export function currentAt(x: number, y: number): { x: number; y: number } {
  const a = Math.sin(x / 900 + 1.3) * 1.2 + Math.cos(y / 700) * 1.4, s = 10 + 8 * Math.sin((x + y) / 1300);
  return { x: Math.cos(a) * s + 4, y: Math.sin(a) * s };
}
