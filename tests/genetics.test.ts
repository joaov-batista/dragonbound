import { describe, expect, it } from 'vitest';
import { breed, createWild, expressPhenotype, GeneticRegistry, genomeKey, growthScale, stageForAge, visualSignature } from '../src/dragons/genetics/genome';
import { SPECIES_IDS } from '../src/dragons/genetics/species';

describe('dragon genetics', () => {
  it('is reproducible from a seed', () => {
    const a = createWild('cinzal', 1234, new GeneticRegistry());
    const b = createWild('cinzal', 1234, new GeneticRegistry());
    expect(a).toEqual(b);
    expect(expressPhenotype(a)).toEqual(expressPhenotype(b));
  });

  it('never produces duplicate ids or genomes across a large population', () => {
    const reg = new GeneticRegistry();
    const ids = new Set<string>(), keys = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const g = createWild(SPECIES_IDS[i % SPECIES_IDS.length], i * 7919 + 13, reg);
      ids.add(g.id); keys.add(genomeKey(g.species, g.genotype));
    }
    expect(ids.size).toBe(3000);
    expect(keys.size).toBe(3000);
  });

  it('retries on a seed collision instead of cloning', () => {
    const reg = new GeneticRegistry();
    const a = createWild('marulho', 42, reg), b = createWild('marulho', 42, reg);
    expect(a.id).not.toBe(b.id);
    expect(genomeKey(a.species, a.genotype)).not.toBe(genomeKey(b.species, b.genotype));
  });

  it('keeps look-alikes rare within a species', () => {
    const reg = new GeneticRegistry();
    const sigs = new Map<string, number>();
    for (let i = 0; i < 60; i++) { const s = visualSignature(expressPhenotype(createWild('folhasca', 900 + i, reg))); sigs.set(s, (sigs.get(s) ?? 0) + 1); }
    expect(Math.max(...sigs.values())).toBeLessThanOrEqual(2);
  });

  it('expresses species character', () => {
    const reg = new GeneticRegistry();
    let fly = 0, heavy = 0;
    for (let i = 0; i < 40; i++) {
      fly += expressPhenotype(createWild('trovisco', i, reg)).stats.flySpeed;
      heavy += expressPhenotype(createWild('pedrusco', i, reg)).stats.flySpeed;
    }
    expect(fly).toBeGreaterThan(heavy * 1.4);
    expect(expressPhenotype(createWild('cinzal', 5, reg)).resist.fire).toBeLessThan(1);
  });

  it('offspring inherit alleles from both parents and are never clones', () => {
    const reg = new GeneticRegistry();
    const m = createWild('marulho', 1, reg, { sex: 'f' }), f = createWild('marulho', 2, reg, { sex: 'm' });
    const kids = Array.from({ length: 50 }, (_, i) => breed(m, f, 100 + i, reg, { mutationRate: 0 }));
    const keys = new Set(kids.map((k) => genomeKey(k.species, k.genotype)));
    expect(keys.size).toBe(50);
    for (const k of kids) {
      expect(k.lineage).toMatchObject({ generation: 1, mother: m.id, father: f.id });
      const [a, b] = k.genotype.cat.tail;
      expect(m.genotype.cat.tail).toContain(a);
      expect(f.genotype.cat.tail).toContain(b);
      expect(Math.min(Math.abs(k.genotype.num.size[0] - m.genotype.num.size[0]), Math.abs(k.genotype.num.size[0] - m.genotype.num.size[1]))).toBeLessThan(0.05);
    }
  });

  it('mutation introduces variation', () => {
    const reg = new GeneticRegistry();
    const m = createWild('cinzal', 11, reg), f = createWild('cinzal', 12, reg);
    let mutated = 0;
    for (let i = 0; i < 40; i++) {
      const k = breed(m, f, 500 + i, reg, { mutationRate: 0.5 });
      const v = k.genotype.num.hue[0];
      if (Math.min(Math.abs(v - m.genotype.num.hue[0]), Math.abs(v - m.genotype.num.hue[1])) > 0.03) mutated++;
    }
    expect(mutated).toBeGreaterThan(5);
  });

  it('grows through life stages', () => {
    expect(stageForAge(0)).toBe('egg');
    expect(stageForAge(1)).toBe('hatchling');
    expect(stageForAge(3)).toBe('juvenile');
    expect(stageForAge(9)).toBe('adult');
    expect(growthScale(1)).toBeLessThan(growthScale(3));
    expect(growthScale(9)).toBe(1);
  });
});
