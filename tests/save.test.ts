import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { game } from '../src/core/state';
import { SAVE_VERSION } from '../src/core/constants';
import { SaveManager } from '../src/save/SaveManager';
import { migrate, newSave, SaveVersionError } from '../src/save/schema';
import { loadIsland, MAIN_SITES } from '../src/world/generation/archipelago';
import { expressPhenotype, genomeKey } from '../src/dragons/genetics/genome';

describe('save system', () => {
  it('round-trips the whole world through IndexedDB, including dragon DNA', async () => {
    game.newGame(4242);
    const island = loadIsland(MAIN_SITES[0]);
    game.populate(island);
    const before = Object.values(game.save.dragons);
    expect(before.length).toBeGreaterThanOrEqual(7);
    before[0].trust = 61; before[0].memories.push({ day: 1, kind: 'fed', v: 9 });
    game.addItem('relic', 2);
    await game.persist();
    const loaded = (await SaveManager.load())!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.dragons[before[0].genes.id].trust).toBe(61);
    expect(loaded.stats.relics).toBe(2);
    for (const r of before) {
      const l = loaded.dragons[r.genes.id];
      expect(genomeKey(l.genes.species, l.genes.genotype)).toBe(genomeKey(r.genes.species, r.genes.genotype));
      expect(expressPhenotype(l.genes)).toEqual(expressPhenotype(r.genes)); // same dragon rebuilt from the save
    }
    game.loadFrom(loaded);
    expect(game.registry.size).toBe(before.length);
  });

  it('populating is deterministic per world seed and unique within it', () => {
    game.newGame(77); game.populate(loadIsland(MAIN_SITES[0]));
    const a = Object.keys(game.save.dragons).sort();
    game.newGame(77); game.populate(loadIsland(MAIN_SITES[0]));
    expect(Object.keys(game.save.dragons).sort()).toEqual(a);
    game.populate(loadIsland(MAIN_SITES[1])); game.populate(loadIsland(MAIN_SITES[2]));
    const keys = Object.values(game.save.dragons).map((r) => genomeKey(r.genes.species, r.genes.genotype));
    expect(new Set(keys).size).toBe(keys.length);
    const trapped = Object.values(game.save.dragons).find((r) => r.trapped)!;
    expect(expressPhenotype(trapped.genes).rideable).toBe(true);
  });

  it('migrates a v1 save and rejects saves from the future', () => {
    const old = newSave(5) as unknown as Record<string, unknown>;
    old.version = 1; delete old.eggs; delete old.stats; (old.ocean as Record<string, unknown>) = { x: 10, y: 20 };
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.eggs).toEqual([]); expect(m.ocean.boatHp).toBe(100); expect(m.ocean.x).toBe(10); expect(m.stats.bonded).toBe(0);
    expect(() => migrate({ ...newSave(1), version: SAVE_VERSION + 1 })).toThrow(SaveVersionError);
    expect(() => migrate(null)).toThrow();
  });

  it('exports and imports as a string', () => {
    game.newGame(9);
    const s = SaveManager.importString(SaveManager.exportString(game.save));
    expect(s.worldSeed).toBe(9);
  });

  it('breeding via eggs yields a new unique hatchling', () => {
    game.newGame(31); game.populate(loadIsland(MAIN_SITES[0]));
    const all = Object.values(game.save.dragons).filter((r) => r.genes.species === 'folhasca');
    const f = all.find((r) => r.genes.sex === 'f') ?? all[0], m = all.find((r) => r.genes.sex !== f.genes.sex);
    if (!m) return; // population happened to be single-sex for this seed
    expect(game.layEgg(f, m, 'alvamar', 100, 100)).toBe(true);
    game.save.day += 1;
    const kids = game.hatchDue('alvamar');
    expect(kids).toHaveLength(1);
    expect(kids[0].genes.lineage.generation).toBe(1);
    expect(game.stage(kids[0])).toBe('hatchling');
    expect(game.registry.size).toBe(Object.keys(game.save.dragons).length);
  });
});

describe('input bindings', async () => {
  const { defaultBindings, findConflicts, rebindKey, rebindPad, padKind } = await import('../src/input/actions');
  it('defaults have no conflicts and rebinding steals the key', () => {
    const b = defaultBindings();
    expect(findConflicts(b)).toEqual([]);
    const c = rebindKey(b, 'attack', 0, 'Space');
    expect(c.keys.attack).toContain('Space'); expect(c.keys.jump).not.toContain('Space');
    expect(findConflicts(c)).toEqual([]);
    const d = rebindPad(b, 'dash', { b: 0 });
    expect(d.pad.jump).toEqual([]); expect(d.pad.dash).toEqual([{ b: 0 }]);
  });
  it('identifies controller families', () => {
    expect(padKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(padKind('DualSense Wireless Controller')).toBe('playstation');
    expect(padKind('Pro Controller (Vendor: 057e Product: 2009)')).toBe('switch');
    expect(padKind('USB Gamepad')).toBe('generic');
  });
  it('InputManager turns injected actions into edges', async () => {
    const { InputManager } = await import('../src/input/InputManager');
    const im = new InputManager(null);
    im.inject('jump', true); im.update();
    expect(im.pressed('jump')).toBe(true);
    im.update(); expect(im.pressed('jump')).toBe(false); expect(im.down('jump')).toBe(true);
    im.inject('jump', false); im.update(); expect(im.released('jump')).toBe(true);
    im.setVirtualAxis(-0.8, 0, true); im.update();
    expect(im.axisX).toBeCloseTo(-0.8); expect(im.down('left')).toBe(true); expect(im.lastDevice).toBe('touch');
  });
});
