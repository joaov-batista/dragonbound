import type { BiomeId } from '../../art/themes';
import type { EnemyKind } from '../../art/enemies';
import type { SpeciesId } from '../../dragons/genetics/types';
import { Cell } from '../../physics/TileGrid';
import { hashInts, mulberry32, pick, randInt } from '../../utils/rng';
import { IslandBuilder } from './IslandBuilder';
import type { IslandData, ItemId } from './types';

/**
 * Depth lanes: every island gets a background and a foreground lane at the same location.
 * They follow the main lane's coastline (same width, same sea level, beaches at the same ends) so the
 * geography stays coherent, but each has its own relief, caves or marshes, resources and dragons.
 */
/** Habitat themes: background = misty highlands / deep caves, foreground = shoreline, marsh and hot springs. */
export const LANE_NAMES: Record<number, string> = { [-1]: 'Fundo', 0: 'Trilha', 1: 'Frente' };

interface LaneRecipe { species: SpeciesId[]; enemies: EnemyKind[]; food: ItemId[]; liquid: 'water' | 'lava' }
const RECIPES: Record<BiomeId, Record<-1 | 1, LaneRecipe>> = {
  tropical: { [-1]: { species: ['geadino', 'pedrusco'], enemies: ['boar', 'bat'], food: ['berry', 'herb', 'shroom'], liquid: 'water' }, [1]: { species: ['marulho', 'trovisco'], enemies: ['crab'], food: ['shell', 'herb', 'berry'], liquid: 'water' } },
  volcanic: { [-1]: { species: ['pedrusco', 'cinzal'], enemies: ['magma', 'bat'], food: ['ember', 'shroom'], liquid: 'lava' }, [1]: { species: ['cinzal', 'marulho'], enemies: ['magma'], food: ['ember', 'fish'], liquid: 'lava' } },
  storm: { [-1]: { species: ['trovisco', 'pedrusco'], enemies: ['wasp'], food: ['herb', 'fish'], liquid: 'water' }, [1]: { species: ['geadino', 'marulho'], enemies: ['crab', 'wasp'], food: ['herb', 'shell'], liquid: 'water' } },
};

/** Elevation (tiles above sea) of the main lane's walkable surface, per column. */
function surfaceHeights(main: IslandData): number[] {
  const g = main.grid, out: number[] = [];
  for (let x = 0; x < g.w; x++) {
    let y = 0;
    while (y < g.h && g.cells[y * g.w + x] !== Cell.Solid) y++;
    out.push(main.seaRow - y);
  }
  return out;
}
const smooth = (a: number[], r: number): number[] => a.map((_, i) => { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; n++; } } return s / n; });

function buildLane(main: IslandData, depth: -1 | 1): IslandData {
  const g = main.grid, seed = hashInts(main.seed, depth + 7), r = mulberry32(seed), rec = RECIPES[main.biome][depth];
  const b = new IslandBuilder(`${main.id}~${depth < 0 ? 'b' : 'f'}`, main.biome, g.w, g.h, main.seaRow, seed);
  const base = smooth(surfaceHeights(main), depth < 0 ? 12 : 6), ph = r() * 6.28;
  b.heights = base.map((h, x) => {
    const t = Math.max(0, Math.min(1, Math.min(x, g.w - 1 - x) / 45)); // taper to the shared beaches at both ends
    const v = depth < 0
      ? h + t * (5 + 4 * Math.sin(x / 19 + ph) + 2.5 * Math.sin(x / 7.3 + ph * 2))   // background: taller, rolling highlands
      : h - t * (2 + 3 * Math.abs(Math.sin(x / 13 + ph)));                           // foreground: lower shore and marsh
    return Math.round(Math.max(-9, Math.min(depth < 0 ? 46 : 30, v)));
  });
  b.terrain();
  const inner = (lo: number, hi: number): number => randInt(r, Math.round(g.w * lo), Math.round(g.w * hi));
  // flat spots for features
  const flats: number[] = [];
  for (let x = 50; x < g.w - 56; x++) if (b.heights[x] > 3 && Math.abs(b.heights[x] - b.heights[x + 6]) <= 1 && Math.abs(b.heights[x] - b.heights[x + 3]) <= 1) flats.push(x);
  if (depth < 0) {
    // a cave under the tallest hill, and a ruined shrine on a flat
    let px = 60, pe = -99;
    for (let x = 60; x < g.w - 60; x++) if (b.heights[x] > pe) { pe = b.heights[x]; px = x; }
    if (pe >= 10) {
      const e = Math.max(2, Math.round(pe * 0.4));
      b.tunnel([[px - 16, b.heights[px - 16] + 1], [px - 7, e + 1]], 2).chamber(px, e + 1, 8, 4).tunnel([[px + 7, e + 1], [px + 16, b.heights[px + 16] + 1]], 2);
      b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), px, e + 1);
      b.spawn((p, id) => ({ t: 'pickup', ...p, item: rec.food[rec.food.length - 1], id }), px + 4, e + 1);
    }
    if (flats.length) { const x = pick(r, flats); b.prop('pillar', x - 4).prop('arch', x).prop('pillar_broken', x + 5); b.spawn((p) => ({ t: 'torch', ...p }), x + 2); }
  } else {
    // marsh pools and a few hanging ledges
    const used: number[] = [];
    for (let k = 0; k < 3 && flats.length; k++) {
      const x = pick(r, flats);
      if (used.some((u) => Math.abs(u - x) < 20)) continue;
      used.push(x);
      const level = Math.min(b.heights[x], b.heights[x + 6]) - 1;
      b.notch(x + 1, x + 5, 2).pool(x + 1, x + 5, level, k === 0 && rec.liquid === 'lava' ? 'lava' : 'water');
      b.platform(x + 2, level + 3, 2);
      if (rec.liquid === 'water') b.spawns.push({ t: 'fishspot', x: (x + 3) * 16 + 8, y: (main.seaRow - level) * 16, id: b.nextId('fishspot') });
    }
    for (let k = 0; k < 4; k++) { const x = inner(0.15, 0.85); b.platform(x, b.heights[x] + 4 + (k % 2) * 2, 3); }
    b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), inner(0.3, 0.7));
  }
  b.floodSea();
  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), inner(0.35, 0.65));
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: pick(r, rec.food), n: 3 }), inner(0.6, 0.8));
  for (let k = 0; k < 5; k++) {
    const x = inner(0.1, 0.9);
    if (main.biome === 'tropical' && k < 3) b.spawn((p, id) => ({ t: 'bush', ...p, id }), x);
    else b.spawn((p, id) => ({ t: 'pickup', ...p, item: pick(r, rec.food), id }), x);
  }
  for (let k = 0; k < 2; k++) {
    const kind = pick(r, rec.enemies), x = inner(0.2, 0.8);
    b.spawn((p) => ({ t: 'enemy', kind, x: p.x, y: kind === 'bat' || kind === 'wasp' ? p.y - 60 : p.y }), x);
  }
  rec.species.forEach((sp, i, all) => b.habitat(sp, Math.round(g.w * (all.length === 1 ? 0.55 : 0.3 + (0.4 * i) / (all.length - 1))), 16, i === 0 ? 2 : 1));
  b.decorate(depth < 0 ? 1.35 : 0.9);
  const d = b.build({ name: main.name, subtitle: main.subtitle, startX: Math.round(g.w / 2), weather: main.weather });
  return d;
}

/** Attach background and foreground lanes to an island (deterministic per island seed). */
export function withLanes(main: IslandData): IslandData {
  if (!main.lanes) main.lanes = [{ depth: -1, data: buildLane(main, -1) }, { depth: 1, data: buildLane(main, 1) }];
  return main;
}

/** All lanes of an island ordered back → front, the island itself as depth 0. */
export function laneList(main: IslandData): { depth: number; data: IslandData }[] {
  return [...(main.lanes ?? []), { depth: 0, data: main }].sort((a, b) => a.depth - b.depth);
}
