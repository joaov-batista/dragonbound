import { describe, expect, it } from 'vitest';
import { game } from '../src/core/state';
import { activeQuests, buy, npcMarker, quest, sell, setFlag, talkTo, tracked, updateQuests } from '../src/story/story';

describe('story & quests', () => {
  it('main questline advances through talk, flags and bonds, with rewards', () => {
    game.newGame(1); const log: string[] = []; const n = (t: string): void => { log.push(t); };
    expect(tracked()!.def.id).toBe('welcome');
    expect(npcMarker('ragna')).toBe('turnin');
    talkTo('ragna', n);
    expect(quest('welcome')!.done).toBe(true); expect(quest('net')!.stage).toBe(0);
    setFlag('saw_trap'); updateQuests(n); expect(quest('net')!.stage).toBe(1);
    const r = Object.values(game.save.dragons)[0]; // no dragons yet in a fresh save: fake one bonded
    if (!r) { game.save.dragons['x'] = { bonded: true } as never; }
    updateQuests(n); expect(quest('net')!.stage).toBe(2);
    const coins = game.save.player.items.coin;
    talkTo('ragna', n); expect(quest('net')!.done).toBe(true); expect(game.save.player.items.coin).toBe(coins + 40);
    expect(quest('hunters')).toBeTruthy();
    setFlag('reached_camp'); setFlag('boss_bruto'); updateQuests(n); updateQuests(n);
    const hp = game.save.player.maxHp; talkTo('ragna', n); expect(game.save.player.maxHp).toBe(hp + 1);
    expect(activeQuests().map((q) => q.id)).toContain('chained');
    expect(log.some((l) => l.startsWith('Missão concluída'))).toBe(true);
  });
  it('side quests are offered, accepted and turned in with items', () => {
    game.newGame(2); const n = (): void => undefined;
    talkTo('ragna', n); // welcome done → fish offered
    expect(npcMarker('sigrun')).toBe('new');
    const t = talkTo('sigrun', n); t.choices![0].run();
    expect(quest('fish')!.stage).toBe(0);
    game.save.player.items.fish = 5; expect(npcMarker('sigrun')).toBe('turnin');
    talkTo('sigrun', n); expect(quest('fish')!.done).toBe(true); expect(game.save.player.items.fish).toBe(1);
  });
  it('market buys and sells with coins', () => {
    game.newGame(3); game.save.player.items.coin = 10;
    expect(buy('herb')).toBe(true); expect(game.save.player.items.coin).toBe(1); expect(buy('herb')).toBe(false);
    expect(sell('herb')).toBe(true); expect(game.save.player.items.coin).toBe(5);
  });
});
