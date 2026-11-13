import type { BiomeId } from '../../art/themes';
import type { EnemyKind } from '../../art/enemies';
import type { SpeciesId } from '../../dragons/genetics/types';
import { mulberry32, pick, rand, randInt } from '../../utils/rng';
import { IslandBuilder } from '../islands/IslandBuilder';
import type { IslandData, ItemId } from '../islands/types';

const NAME_A = ['Ilhota', 'Recife', 'Pedra', 'Atol', 'Ponta', 'Banco'];
const NAME_B: Record<BiomeId, string[]> = {
  tropical: ['das Conchas', 'do Sossego', 'Verde', 'das Garças', 'do Coqueiral', 'da Maré Mansa'],
  volcanic: ['Cinzenta', 'do Tição', 'das Brasas', 'Fumegante', 'do Enxofre', 'Rubra'],
  storm: ['do Vendaval', 'dos Ecos', 'Cinzel', 'da Geada', 'do Relâmpago', 'Partida'],
};
const SPECIES: Record<BiomeId, SpeciesId[]> = { tropical: ['folhasca', 'marulho'], volcanic: ['cinzal', 'pedrusco'], storm: ['trovisco', 'geadino'] };
const ENEMIES: Record<BiomeId, EnemyKind[]> = { tropical: ['crab', 'boar'], volcanic: ['magma', 'bat'], storm: ['wasp', 'crab'] };
const FOOD: Record<BiomeId, ItemId[]> = { tropical: ['herb', 'shell'], volcanic: ['ember', 'ember'], storm: ['herb', 'fish'] };

export function isletName(seed: number, biome: BiomeId): string {
  const r = mulberry32(seed ^ 0x51a7);
  return `${pick(r, NAME_A)} ${pick(r, NAME_B[biome])}`;
}

/**
 * Seeded secondary island. Same rules as the hand-built ones (relief → materials → sea →
 * habitats → resources → dressing), so every seed yields a coherent, fully explorable islet.
 */
export function generateIsland(seed: number, biome: BiomeId): IslandData {
  const r = mulberry32(seed);
  const w = randInt(r, 150, 200), h = 92, sea = 60;
  const b = new IslandBuilder(`islet-${seed.toString(36)}`, biome, w, h, sea, seed);
  // relief: beaches at both ends, 1–3 hills, optional plateau
  const pts: [number, number][] = [[0, -8], [20, -6], [28, -1], [33, 2]];
  const hills = randInt(r, 1, 3), span = (w - 70) / hills, maxE = biome === 'storm' ? 30 : biome === 'volcanic' ? 26 : 18;
  let peakX = 60, peakE = 0;
  for (let i = 0; i < hills; i++) {
    const x0 = 36 + i * span, e = rand(r, 7, maxE), px = x0 + span * rand(r, 0.35, 0.65);
    pts.push([Math.round(x0 + span * 0.12), Math.round(rand(r, 2, 5))], [Math.round(px - rand(r, 3, 8)), Math.round(e)], [Math.round(px + rand(r, 3, 8)), Math.round(e + rand(r, -2, 2))]);
    if (e > peakE) { peakE = e; peakX = Math.round(px); }
  }
  pts.push([w - 34, 2], [w - 28, -1], [w - 20, -6], [w - 1, -9]);
  b.profile(pts, biome === 'tropical' ? 0.6 : 0.9).terrain();

  // a pool or lava basin on flat ground
  const flats: number[] = [];
  for (let x = 40; x < w - 46; x++) if (b.heights[x] > 3 && Math.abs(b.heights[x] - b.heights[x + 6]) <= 1) flats.push(x);
  if (flats.length && r() < 0.8) {
    const x = pick(r, flats);
    b.notch(x + 1, x + 5, 2).pool(x + 1, x + 5, Math.min(b.heights[x], b.heights[x + 6]) - 1, biome === 'volcanic' ? 'lava' : 'water');
    if (biome === 'volcanic') b.platform(x + 2, b.heights[x] + 2, 2);
  }
  // cave under the main hill
  let caveX = -1;
  if (peakE >= 10) {
    const e = Math.max(2, Math.round(peakE * 0.35));
    b.tunnel([[peakX - 14, b.heights[peakX - 14] + 1], [peakX - 6, e + 1]], 2).chamber(peakX, e + 1, 7, 4).tunnel([[peakX + 6, e + 1], [peakX + 13, b.heights[peakX + 13] + 1]], 2);
    caveX = peakX;
  }
  b.floodSea();
  b.dock(22, 29, -1);

  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), 38);
  const sp = SPECIES[biome];
  b.habitat(pick(r, sp), Math.round(w * rand(r, 0.4, 0.6)), 14, randInt(r, 1, 2));
  if (caveX > 0 && r() < 0.6) b.habitat(biome === 'tropical' ? 'pedrusco' : sp[1], caveX, 5, 1, Math.max(2, Math.round(peakE * 0.35)));
  if (caveX > 0) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), caveX, Math.max(2, Math.round(peakE * 0.35)) + 1);
  else b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), peakX);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: pick(r, FOOD[biome]), n: randInt(r, 2, 4) }), Math.round(w - 44));
  const nRes = randInt(r, 3, 6);
  for (let i = 0; i < nRes; i++) {
    const x = randInt(r, 42, w - 46);
    if (biome === 'tropical' && r() < 0.6) b.spawn((p, id) => ({ t: 'bush', ...p, id }), x);
    else b.spawn((p, id) => ({ t: 'pickup', ...p, item: pick(r, FOOD[biome]), id }), x);
  }
  for (const x of [14, w - 12]) b.spawn((p, id) => ({ t: 'fishspot', x: p.x, y: sea * 16, id }), x);
  const nEn = randInt(r, 2, 4);
  for (let i = 0; i < nEn; i++) {
    const kind = pick(r, ENEMIES[biome]), x = randInt(r, 50, w - 50);
    b.spawn((p) => ({ t: 'enemy', kind, x: p.x, y: kind === 'wasp' || kind === 'bat' ? p.y - 60 : p.y }), x);
  }
  if (peakE > 14) b.wind(peakX + 8, peakE + 16, 6, peakE + 10, 0, -200);
  b.decorate(1);
  return b.build({ name: isletName(seed, biome), subtitle: 'Ilhota inexplorada', startX: 36, weather: biome === 'storm' ? 'rain' : biome === 'volcanic' ? 'ash' : 'clear' });
}
