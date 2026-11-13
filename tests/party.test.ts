import { describe, expect, it } from 'vitest';
import { settings } from '../src/core/settings';
import { game } from '../src/core/state';
import type { DragonRecord } from '../src/dragons/DragonRecord';

const fake = (id: string): DragonRecord => ({ genes: { id } as never, name: id, bornDay: 0, hp: 5, hunger: 0, energy: 1, trust: 95, fear: 0, bonded: true, training: 50, observed: 1, drift: {}, memories: [],
  island: 'alvamar', homeX: 0, homeY: 0, homeR: 100, x: 10, y: 20, follow: true, trapped: false, injured: false, met: true });

describe('party: following, kept and released dragons', () => {
  it('respects the follower limit, keeps and calls back, releases to the wild', () => {
    game.newGame(3); settings.maxFollowers = 2;
    for (const id of ['a', 'b', 'c']) game.save.dragons[id] = fake(id);
    game.save.companion = 'a';
    // three follow but only two are allowed: the extra one is kept where it stands
    const kept = game.enforceParty();
    expect(kept.map((r) => r.name)).toEqual(['c']);
    expect(game.party().map((r) => r.name)).toEqual(['a', 'b']);
    expect(game.partyStatus(game.save.dragons.c)).toBe('Guardado');
    expect(game.save.dragons.c.homeX).toBe(10);
    // the party is full: calling c back is refused
    expect(game.callBack(game.save.dragons.c)).toMatch(/Limite/);
    // keep b, then c can come back
    game.keep(game.save.dragons.b);
    expect(game.callBack(game.save.dragons.c)).toBeNull();
    expect(game.party().map((r) => r.name)).toEqual(['a', 'c']);
    // keeping the companion hands the role to someone still following
    game.keep(game.save.dragons.a);
    expect(game.save.companion).toBe('c');
    // release: no longer bonded, remembers being freed, companion moves on
    game.release(game.save.dragons.c);
    const c = game.save.dragons.c;
    expect(c.bonded).toBe(false); expect(c.kept).toBe(false); expect(c.trust).toBeLessThanOrEqual(45);
    expect(c.memories.at(-1)!.kind).toBe('freed');
    expect(game.save.companion).not.toBe('c');
    expect(game.partyStatus(c)).toBe('');
    settings.maxFollowers = 3;
  });
});
