import { describe, expect, it } from 'vitest';
import { DragonMind, type Percept } from '../src/dragons/ai/DragonMind';
import { createWild, expressPhenotype, GeneticRegistry } from '../src/dragons/genetics/genome';
import type { DragonRecord } from '../src/dragons/DragonRecord';
import { bondStage } from '../src/dragons/DragonRecord';
import type { SpeciesId } from '../src/dragons/genetics/types';

function mk(species: SpeciesId, seed: number, over: Partial<DragonRecord> = {}): { rec: DragonRecord; mind: DragonMind } {
  const genes = createWild(species, seed, new GeneticRegistry());
  const ph = expressPhenotype(genes);
  const rec: DragonRecord = { genes, name: 'T', bornDay: -20, hp: ph.stats.maxHp, hunger: 0.5, energy: 0.9, trust: 0, fear: 0, bonded: false, training: 0, observed: 0, drift: {}, memories: [], island: 'x', homeX: 0, homeY: 0, homeR: 200, x: 0, y: 0, follow: false, trapped: false, injured: false, met: false, ...over };
  return { rec, mind: new DragonMind(rec, ph) };
}
const percept = (o: Partial<Percept['player']> = {}, px = 120): Percept => ({
  dt: 0.1, day: 1, night: false, storm: false, x: 0, y: 0, grounded: true, stuck: false,
  player: { x: px, y: 0, dist: Math.abs(px), motion: 'still', visible: true, offering: null, gesturing: false, mounted: false, threatened: false, alive: true, ...o },
  threat: null, food: null, other: null,
});
const run = (mind: DragonMind, p: Percept, secs: number): void => { for (let i = 0; i < secs * 10; i++) mind.update(p); };

describe('taming & behaviour', () => {
  it('running at a wild dragon frightens it; standing still does not', () => {
    const a = mk('folhasca', 3), b = mk('folhasca', 3);
    run(a.mind, percept({ motion: 'run' }, 60), 4);
    run(b.mind, percept({ motion: 'still' }, 60), 4);
    expect(a.rec.fear).toBeGreaterThan(40);
    expect(b.rec.fear).toBeLessThan(5);
    expect(a.mind.state).toBe('flee');
  });

  it('personality changes the reaction to the same stimulus', () => {
    const fears: number[] = [];
    for (let s = 1; s <= 30; s++) { const d = mk('marulho', s); run(d.mind, percept({ motion: 'walk' }, 50), 3); fears.push(d.rec.fear); }
    expect(Math.max(...fears) - Math.min(...fears)).toBeGreaterThan(12);
  });

  it('patient observation builds early trust and knowledge', () => {
    const d = mk('marulho', 8);
    run(d.mind, percept({ motion: 'still' }, 110), 40);
    expect(d.rec.trust).toBeGreaterThan(12);
    expect(d.rec.observed).toBeGreaterThan(0.3);
    expect(d.rec.met).toBe(true);
  });

  it('petting too soon backfires, petting a trusting dragon works', () => {
    const d = mk('marulho', 9);
    const bad = d.mind.bond.pet(1)!;
    expect(bad.kind).toBe('petTooSoon'); expect(d.rec.fear).toBeGreaterThan(15);
    const e = mk('marulho', 9, { trust: 60 });
    expect(e.mind.bond.pet(1)!.kind).toBe('pet'); expect(e.rec.trust).toBeGreaterThan(60);
  });

  it('favourite food is worth more than disliked food', () => {
    const a = mk('cinzal', 4, { trust: 20, hunger: 0.8 }), b = mk('cinzal', 4, { trust: 20, hunger: 0.8 });
    const ph = expressPhenotype(a.rec.genes);
    a.mind.bond.feed(ph.favoriteFood, 1); b.mind.bond.feed(ph.dislikedFood, 1);
    expect(a.rec.trust).toBeGreaterThan(28); expect(b.rec.trust).toBeLessThan(20);
  });

  it('a hungry, calm dragon comes to take offered food', () => {
    const d = mk('marulho', 12, { trust: 30, hunger: 0.9 });
    const ph = expressPhenotype(d.rec.genes);
    let took = false, x = 0;
    for (let i = 0; i < 400 && !took; i++) { const p = percept({ offering: ph.favoriteFood }, 90); p.x = x; p.player.dist = Math.abs(90 - x); const o = d.mind.update(p); if (o.speed > 0) x += Math.sign(o.tx - x) * 4; took = o.tookOffer; }
    expect(took).toBe(true);
  });

  it('hurting a dragon is remembered and shifts its personality', () => {
    const d = mk('trovisco', 5, { trust: 50 });
    d.mind.bond.hurtByPlayer(1);
    expect(d.rec.trust).toBeLessThan(30);
    expect(d.rec.memories.some((m) => m.kind === 'hurtByHuman')).toBe(true);
    expect(Object.keys(d.rec.drift).length).toBeGreaterThan(0);
  });

  it('full taming loop: observe → feed → pet → bond → follow', () => {
    const d = mk('marulho', 21, { hunger: 0.9 });
    const ph = expressPhenotype(d.rec.genes);
    run(d.mind, percept({ motion: 'still' }, 110), 45);
    expect(bondStage(d.rec)).not.toBe('wild');
    for (let i = 0; i < 6 && d.rec.trust < 60; i++) { d.rec.hunger = 0.9; d.mind.bond.feed(ph.favoriteFood, 1); }
    for (let i = 0; i < 12 && d.rec.trust < 85; i++) { d.mind.bond.pet(1); d.mind.bond.tick(5); }
    expect(d.mind.bond.canBond()).toBe(true);
    d.mind.bond.completeBond(1);
    expect(bondStage(d.rec)).toBe('bonded');
    d.mind.force('rest');
    run(d.mind, percept({ motion: 'run' }, 300), 2);
    expect(d.mind.state).toBe('follow');
    expect(d.rec.fear).toBe(0);
  });

  it('territorial dragons warn first and respect a retreat', () => {
    let found = false;
    for (let s = 1; s < 60 && !found; s++) {
      const d = mk('cinzal', s);
      if (d.mind.traits.territoriality < 0.7) continue;
      found = true;
      run(d.mind, percept({ motion: 'sneak' }, 40), 1.5);
      expect(d.mind.state).toBe('defend');
      const t0 = d.rec.trust;
      run(d.mind, percept({ motion: 'sneak' }, 400), 1.5);
      expect(d.rec.memories.some((m) => m.kind === 'respected')).toBe(true);
      expect(d.rec.trust).toBeGreaterThan(t0);
    }
    expect(found).toBe(true);
  });

  it('bonded dragons obey more with training and less when independent', () => {
    const d = mk('trovisco', 7, { trust: 90, bonded: true });
    let a = 0, b = 0;
    for (let i = 0; i < 200; i++) if (d.mind.bond.obeys('come', (i % 100) / 100)) a++;
    d.rec.training = 100; d.rec.trust = 100;
    for (let i = 0; i < 200; i++) if (d.mind.bond.obeys('come', (i % 100) / 100)) b++;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(a).toBeGreaterThan(20);
  });
});
