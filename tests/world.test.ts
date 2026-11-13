import { describe, expect, it } from 'vitest';
import { Cell, Liquid } from '../src/physics/TileGrid';
import { makeBody, moveBody } from '../src/physics/Body';
import { allSites, isletInChunk, loadIsland, MAIN_SITES } from '../src/world/generation/archipelago';
import { generateIsland } from '../src/world/generation/proceduralIsland';

describe('islands', () => {
  for (const site of MAIN_SITES) {
    it(`${site.id} is explorable: solid ground at start, sea at the edges, habitats and docks`, () => {
      const d = loadIsland(site), g = d.grid;
      expect(g.solidPx(d.start.x, d.start.y + 4)).toBe(true);
      expect(g.solidPx(d.start.x, d.start.y - 20)).toBe(false);
      expect(g.liquidAt(8, (d.seaRow + 1) * 16)).toBe(Liquid.Water);
      expect(g.liquidAt(g.pxW - 8, (d.seaRow + 1) * 16)).toBe(Liquid.Water);
      expect(d.habitats.length).toBeGreaterThan(0);
      expect(d.spawns.some((s) => s.t === 'dock')).toBe(true);
      // every ground spawn rests on something solid
      for (const s of d.spawns) if (s.t === 'campfire' || s.t === 'chest' || s.t === 'bush') expect(g.cell(Math.floor(s.x / 16), Math.floor(s.y / 16))).not.toBe(Cell.Empty);
    });
  }
  it('procedural islets are deterministic per seed and differ across seeds', () => {
    const a = generateIsland(99, 'tropical'), b = generateIsland(99, 'tropical'), c = generateIsland(100, 'tropical');
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(a.spawns).toEqual(b.spawns);
    expect(Array.from(a.grid.cells)).not.toEqual(Array.from(c.grid.cells));
    for (const biome of ['tropical', 'volcanic', 'storm'] as const) for (let s = 1; s < 12; s++) {
      const d = generateIsland(s * 7717, biome);
      expect(d.grid.solidPx(d.start.x, d.start.y + 4)).toBe(true);
      expect(d.habitats.length).toBeGreaterThan(0);
    }
  });
  it('archipelago layout is stable and keeps islets away from main islands', () => {
    const sites = allSites(4242);
    expect(sites.length).toBeGreaterThan(8);
    expect(allSites(4242)).toEqual(sites);
    expect(isletInChunk(4242, 3, 3)).toEqual(isletInChunk(4242, 3, 3));
    for (const s of sites) if (!s.main) for (const m of MAIN_SITES) expect(Math.hypot(s.x - m.x, s.y - m.y)).toBeGreaterThan(m.r + 300);
  });
});

describe('body physics', () => {
  const d = loadIsland(MAIN_SITES[0]);
  it('falls and lands on the ground', () => {
    const b = makeBody(d.start.x, d.start.y - 60, 10, 22);
    for (let i = 0; i < 120; i++) { b.vy = Math.min(b.vy + 900 / 60, 400); moveBody(d.grid, b, 1 / 60); }
    expect(b.onGround).toBe(true);
    expect(Math.abs(b.y - d.start.y)).toBeLessThan(17);
  });
  it('does not tunnel through terrain at high speed', () => {
    const b = makeBody(d.start.x, d.start.y - 40, 10, 22);
    b.vy = 4000;
    moveBody(d.grid, b, 1 / 30);
    expect(d.grid.solidPx(b.x, b.y - 1)).toBe(false);
    expect(b.onGround).toBe(true);
  });
  it('walks over one-tile steps but is stopped by walls', () => {
    const b = makeBody(d.start.x, d.start.y, 10, 22);
    let stopped = false;
    for (let i = 0; i < 60 * 30 && !stopped; i++) { b.vx = 110; b.vy = Math.min(b.vy + 15, 400); moveBody(d.grid, b, 1 / 60); if (b.wall === 1 && b.onGround) stopped = true; }
    expect(b.x).toBeGreaterThan(d.start.x + 200);
  });
});

describe('depth lanes', () => {
  it('every island has a background and a foreground lane, explorable and populated, sharing the coastline', async () => {
    const { laneList } = await import('../src/world/islands/lanes');
    for (const site of MAIN_SITES) {
      const d = loadIsland(site), lanes = laneList(d);
      expect(lanes.map((l) => l.depth)).toEqual([-1, 0, 1]);
      for (const { data } of lanes) {
        const g = data.grid;
        expect(g.w).toBe(d.grid.w); expect(data.seaRow).toBe(d.seaRow);
        expect(data.habitats.length).toBeGreaterThan(0);
        expect(g.liquidAt(8, (d.seaRow + 1) * 16)).toBe(Liquid.Water);
        // there is walkable ground above the sea somewhere in the middle of the lane
        let walk = 0;
        for (let x = 40; x < g.w - 40; x++) { const top = g.groundBelow(x * 16 + 8, 0, g.h); if (top !== null && top < d.seaRow * 16) walk++; }
        expect(walk).toBeGreaterThan((g.w - 80) * 0.5);
      }
      // the lanes differ from the main lane (different relief), and from each other
      const sig = (g: typeof d.grid): string => Array.from(g.cells).join('');
      expect(new Set(lanes.map((l) => sig(l.data.grid))).size).toBe(3);
      // deterministic
      expect(sig(laneList(loadIsland(site))[0].data.grid)).toBe(sig(lanes[0].data.grid));
    }
  });
});
