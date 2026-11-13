import { game } from '../core/state';
import type { ItemId } from '../world/islands/types';

/**
 * Story layer: quests, flags and NPC dialogue for Vigiamar and the Scale Hunters arc.
 * Pure logic (no Phaser) — the scenes report what happens (talk, flags, bonds, bosses) and
 * render whatever this returns.
 */
export type QuestId = 'welcome' | 'net' | 'hunters' | 'chained' | 'embers' | 'fish' | 'secrets' | 'keeper';
export interface QuestState { stage: number; done: boolean }
export interface StoryState { quests: Partial<Record<QuestId, QuestState>>; flags: Record<string, number>; tracked: QuestId | null }

interface Stage { text: string; talk?: string; when?: () => boolean }
interface QuestDef { id: QuestId; title: string; giver: string; main: boolean; summary: string; stages: Stage[]; reward: { coins?: number; items?: Partial<Record<ItemId, number>>; maxHp?: number; sword?: number; text: string }; next?: QuestId[] }

const S = (): StoryState => (game.save.story ??= { quests: { welcome: { stage: 0, done: false } }, flags: {}, tracked: 'welcome' });
export const flag = (k: string): number => S().flags[k] ?? 0;
export const setFlag = (k: string, v = 1): void => { S().flags[k] = v; };
const items = (i: ItemId): number => game.save.player.items[i] ?? 0;
const secretsFound = (): number => ['secret_cellar', 'secret_pier', 'secret_falls'].filter((k) => flag(k)).length;

export const QUESTS: Record<QuestId, QuestDef> = {
  welcome: { id: 'welcome', title: 'Boas-vindas a Vigiamar', giver: 'ragna', main: true, summary: 'A Chefe Ragna quer falar com quem chegou ontem no barco do pescador.',
    stages: [{ text: 'Fale com a Chefe Ragna, no Salão no alto da praça', talk: 'ragna' }], reward: { coins: 15, text: '+15 moedas' }, next: ['net'] },
  net: { id: 'net', title: 'O dragão na rede', giver: 'ragna', main: true, summary: 'Caçadores de Escama armaram redes na praia leste. Um dragão ficou preso.',
    stages: [
      { text: 'Encontre o dragão preso na praia leste', when: () => flag('saw_trap') > 0 },
      { text: 'Liberte-o e conquiste a confiança dele (corte a rede, alimente, aproxime-se com calma)', when: () => game.bondedList().length > 0 },
      { text: 'Conte à Chefe Ragna o que aconteceu', talk: 'ragna' },
    ], reward: { coins: 40, items: { herb: 2 }, text: '+40 moedas, +2 ervas' }, next: ['hunters', 'keeper'] },
  hunters: { id: 'hunters', title: 'Rastros dos Caçadores', giver: 'ragna', main: true, summary: 'Os Caçadores de Escama, da Capitã Varga Ferro-Rubro, montaram acampamento a leste da vila.',
    stages: [
      { text: 'Siga os rastros até o acampamento dos Caçadores, no extremo leste', when: () => flag('reached_camp') > 0 },
      { text: 'Derrote Bruto Garra-de-Ferro', when: () => flag('boss_bruto') > 0 },
      { text: 'Volte à Chefe Ragna', talk: 'ragna' },
    ], reward: { coins: 80, maxHp: 1, text: '+80 moedas, +1 coração' }, next: ['chained'] },
  chained: { id: 'chained', title: 'O Gigante Acorrentado', giver: 'ragna', main: true, summary: 'Bruto confessou: Varga prendeu um dragão-alfa na forja do Monte Brasaviva para forjar armas de escama.',
    stages: [
      { text: 'Navegue até o Monte Brasaviva (doca oeste → mar → leste)', when: () => game.save.ocean.discovered.includes('brasaviva') && game.save.player.island === 'brasaviva' },
      { text: 'Encontre a forja dos Caçadores na encosta leste do vulcão', when: () => flag('reached_forge') > 0 },
      { text: 'Quebre as quatro correntes do Gigante', when: () => flag('boss_alpha') > 0 },
      { text: 'Leve a notícia à Chefe Ragna em Vigiamar', talk: 'ragna' },
    ], reward: { coins: 150, maxHp: 1, text: '+150 moedas, +1 coração' } },
  embers: { id: 'embers', title: 'Brasa para a forja', giver: 'olvar', main: false, summary: 'Olvar pode reforjar sua lâmina se tiver cristais de brasa do vulcão.',
    stages: [{ text: 'Traga 3 Cristais de brasa a Olvar (têm no Monte Brasaviva)', talk: 'olvar', when: () => items('ember') >= 3 }], reward: { sword: 1, text: 'Lâmina reforjada: +1 de dano' } },
  fish: { id: 'fish', title: 'Peixe para o mercado', giver: 'sigrun', main: false, summary: 'A banca de Sigrun está vazia desde que os caçadores espantaram os cardumes.',
    stages: [{ text: 'Traga 4 peixes para Sigrun no Mercado do Cais', talk: 'sigrun', when: () => items('fish') >= 4 }], reward: { coins: 45, text: '+45 moedas' } },
  secrets: { id: 'secrets', title: 'Os três segredos de Vigiamar', giver: 'ingrid', main: false, summary: 'A Velha Ingrid jura que os fundadores esconderam três fragmentos pela vila.',
    stages: [{ text: `Encontre os segredos: porão da Rua das Casas, sob o Cais e atrás da cachoeira`, when: () => secretsFound() >= 3 }, { text: 'Mostre os fragmentos à Velha Ingrid', talk: 'ingrid' }],
    reward: { maxHp: 1, coins: 30, text: 'Amuleto dos Vinculados: +1 coração, +30 moedas' } },
  keeper: { id: 'keeper', title: 'Cuidar de um dragão', giver: 'bjarni', main: false, summary: 'Bjarni, do estábulo, ensina: confiança se renova todo dia.',
    stages: [{ text: 'Faça carinho no seu dragão 3 vezes e voe com ele', when: () => flag('pets') >= 3 && game.save.stats.flights > 0 }, { text: 'Fale com Bjarni no estábulo', talk: 'bjarni' }], reward: { items: { meat: 3, fish: 2 }, coins: 20, text: '+3 carne, +2 peixe, +20 moedas' } },
};

export function quest(id: QuestId): QuestState | undefined { return S().quests[id]; }
export function activeQuests(): QuestDef[] { return (Object.keys(QUESTS) as QuestId[]).filter((id) => quest(id) && !quest(id)!.done).map((id) => QUESTS[id]); }
export function doneQuests(): QuestDef[] { return (Object.keys(QUESTS) as QuestId[]).filter((id) => quest(id)?.done).map((id) => QUESTS[id]); }
export function tracked(): { def: QuestDef; stage: Stage } | null {
  const st = S(); let id = st.tracked;
  if (!id || !quest(id) || quest(id)!.done) { id = activeQuests().find((q) => q.main)?.id ?? activeQuests()[0]?.id ?? null; st.tracked = id; }
  if (!id) return null;
  const def = QUESTS[id]; return { def, stage: def.stages[Math.min(quest(id)!.stage, def.stages.length - 1)] };
}
export function startQuest(id: QuestId, notify: (t: string) => void): void {
  if (quest(id)) return;
  S().quests[id] = { stage: 0, done: false };
  notify(`Nova missão: ${QUESTS[id].title}`);
  if (QUESTS[id].main) S().tracked = id;
}

function complete(id: QuestId, notify: (t: string, icon?: string) => void): void {
  const q = quest(id)!, def = QUESTS[id], r = def.reward, p = game.save.player;
  q.done = true;
  if (r.coins) game.addItem('coin', r.coins);
  for (const [k, n] of Object.entries(r.items ?? {})) game.addItem(k as ItemId, n!);
  if (r.maxHp) { p.maxHp = Math.min(10, p.maxHp + r.maxHp); p.hp = p.maxHp; }
  if (r.sword) setFlag('sword', flag('sword') + r.sword);
  notify(`Missão concluída: ${def.title} — ${r.text}`, 'star');
  for (const n of def.next ?? []) startQuest(n, notify);
}

/** Advance every active quest whose current stage condition is met (call a few times per second). */
export function updateQuests(notify: (t: string, icon?: string) => void): void {
  for (const def of activeQuests()) {
    const q = quest(def.id)!, st = def.stages[q.stage];
    if (!st || st.talk) continue;
    if (st.when?.()) { q.stage++; if (q.stage >= def.stages.length) complete(def.id, notify); else notify(`${def.title}: ${def.stages[q.stage].text}`, 'scroll'); }
  }
}

/** NPC has something quest-related to say: 'new' (offer), 'turnin' (ready), or null. */
export function npcMarker(who: string): 'new' | 'turnin' | null {
  for (const def of activeQuests()) { const st = def.stages[quest(def.id)!.stage]; if (st?.talk === who && (!st.when || st.when())) return 'turnin'; }
  for (const id of OFFERS[who] ?? []) if (!quest(id) && (REQUIRES[id]?.() ?? true)) return 'new';
  return null;
}

const OFFERS: Record<string, QuestId[]> = { olvar: ['embers'], sigrun: ['fish'], ingrid: ['secrets'] };
const REQUIRES: Partial<Record<QuestId, () => boolean>> = { embers: () => !!quest('net')?.done, secrets: () => !!quest('welcome')?.done, fish: () => !!quest('welcome')?.done };

export interface Choice { label: string; run: () => void }
export interface Talk { speaker: string; lines: string[]; choices?: Choice[]; shop?: boolean }
export const NAMES: Record<string, string> = { ragna: 'Chefe Ragna', olvar: 'Olvar, o ferreiro', sigrun: 'Sigrun, peixeira', kael: 'Kael, frutas e ervas', ingrid: 'Velha Ingrid', bjarni: 'Bjarni do estábulo', mira: 'Mira, cartógrafa', halvar: 'Halvar, vigia', tor: 'Velho Tor', ivo: 'Ivo', lia: 'Lia', varga: 'Capitã Varga Ferro-Rubro', bruto: 'Bruto Garra-de-Ferro' };
export const SHOPKEEPERS = new Set(['sigrun', 'kael', 'mira']);

const AMBIENT: Record<string, string[]> = {
  ragna: ['Vigiamar já caçou dragões. Hoje aprendemos a ouvi-los.', 'Se os Caçadores voltarem, a vila inteira estará com você.'],
  olvar: ['Ferro bom precisa de brasa boa.', 'Cuidado com essa lâmina. Ela é mais velha que você.'],
  sigrun: ['Peixe fresco! Bom, quase fresco.', 'Marulhos adoram peixe. Quem diria, né?'],
  kael: ['Frutas da encosta! Folhascas trocam a alma por uma dessas.', 'Erva curativa: pra você e pro seu dragão.'],
  ingrid: ['Os fundadores não domavam dragões. Eles se vinculavam.', 'Dizem que há um porão sob a casa vermelha… bobagem, claro.'],
  bjarni: ['Dragão bem cuidado obedece por amor, não por medo.', 'Nunca chegue correndo num dragão que não te conhece.'],
  mira: ['Já mapeei metade do arquipélago. A outra metade tem tempestade demais.', 'Vulcão a leste, agulhas ao norte. O resto é névoa.'],
  halvar: ['Da torre vejo velas vermelhas no horizonte. Caçadores.', 'Fique de olho no céu.'],
  tor: ['Quarenta anos pescando e nunca vi o mar tão vazio.', 'Atrás da cachoeira? Hm. Quando eu era menino… deixa pra lá.'],
  ivo: ['Quando eu crescer vou voar num Trovisco!', 'A Lia tem medo de dragão! … Não conta pra ela que eu falei.'],
  lia: ['Eu não tenho medo! Só respeito.', 'Debaixo do cais tem um baú. Eu vi! Só não consegui entrar.'],
};

/** What an NPC says when you talk to them, given the story so far. `notify` posts toasts. */
export function talkTo(who: string, notify: (t: string, icon?: string) => void): Talk {
  const speaker = NAMES[who] ?? who;
  // quest turn-ins first
  for (const def of activeQuests()) {
    const q = quest(def.id)!, st = def.stages[q.stage];
    if (st?.talk !== who || (st.when && !st.when())) continue;
    const lines = TURNIN[def.id]?.[q.stage] ?? ['Obrigado.'];
    if (def.id === 'embers') game.save.player.items.ember -= 3;
    if (def.id === 'fish') game.save.player.items.fish -= 4;
    q.stage++;
    if (q.stage >= def.stages.length) complete(def.id, notify); else notify(`${def.title}: ${def.stages[q.stage].text}`, 'scroll');
    return { speaker, lines };
  }
  // offers
  for (const id of OFFERS[who] ?? []) if (!quest(id) && (REQUIRES[id]?.() ?? true))
    return { speaker, lines: OFFER_LINES[id], choices: [{ label: 'Aceitar missão', run: () => startQuest(id, notify) }, { label: 'Agora não', run: () => undefined }] };
  // progress hints for active quests given by this NPC
  for (const def of activeQuests()) if (def.giver === who) return { speaker, lines: [HINTS[def.id] ?? def.stages[quest(def.id)!.stage].text], shop: SHOPKEEPERS.has(who) };
  const amb = AMBIENT[who] ?? ['…'], k = (flag('talk_' + who) + 1) % amb.length; setFlag('talk_' + who, k);
  return { speaker, lines: [amb[k]], shop: SHOPKEEPERS.has(who) };
}
export function ambientLine(who: string, i: number): string | null { const a = AMBIENT[who]; return a ? a[i % a.length] : null; }

const OFFER_LINES: Record<string, string[]> = {
  embers: ['Essa lâmina já viu dias melhores.', 'Traga três cristais de brasa do Monte Brasaviva e eu a reforjo. Vai cortar até corrente de caçador.'],
  fish: ['Os caçadores espantaram os cardumes e minha banca está vazia.', 'Me traz quatro peixes? Pago bem. Pesque no cais ou sobre o mar aberto.'],
  secrets: ['Chegue mais perto, criança.', 'Os fundadores esconderam três fragmentos em Vigiamar: um sob a terra, um sob as tábuas, um atrás da água que cai.', 'Ache os três e eu te conto o que eles guardavam.'],
};
const TURNIN: Partial<Record<QuestId, Record<number, string[]>>> = {
  welcome: { 0: ['Então você é quem o velho Tor tirou do mar. Bem-vindo a Vigiamar.', 'Aqui, dragões não são ferramentas: são vizinhos. Mas há quem discorde.', 'Os Caçadores de Escama armaram redes na praia leste. Vá ver. E vá com calma.'] },
  net: { 2: ['Você libertou um dragão e ele escolheu ficar com você. Isso não se ensina.', 'Mas os Caçadores vão querer o que é deles. Os rastros seguem para o leste.', 'Encontre o acampamento. Se Bruto Garra-de-Ferro estiver lá… cuidado.'] },
  hunters: { 2: ['Bruto derrotado! A vila vai cantar isso por semanas.', 'Antes de fugir ele falou da Capitã Varga e de um gigante acorrentado no Monte Brasaviva.', 'Pegue o barco na doca oeste. Ou, melhor ainda, vá voando.'] },
  chained: { 3: ['Você libertou o Gigante… e viu Varga com os próprios olhos.', 'Ela vai voltar, e com mais navios. Mas hoje Vigiamar dorme em paz.', '— Fim da versão beta. Obrigado por jogar! —'] },
  embers: { 0: ['Brasa de verdade! Segura isso aqui… pronto.', 'Sua lâmina agora corta mais fundo. Use bem.'] },
  fish: { 0: ['Quatro peixes! Minha banca voltou à vida.', 'Tome, você mereceu.'] },
  secrets: { 1: ['Os três fragmentos… juntos, formam o sinal dos Vinculados.', 'Use-o perto do coração. Os antigos diziam que ele dá coragem.'] },
  keeper: { 1: ['Viu? Ele te recebe diferente agora.', 'Leve isto: comida boa para os dois.'] },
};
const HINTS: Partial<Record<QuestId, string>> = {
  net: 'A praia leste fica depois do penhasco e da cachoeira. Siga a costa.',
  hunters: 'O acampamento fica no extremo leste da ilha, perto da doca leste.',
  chained: 'Monte Brasaviva fica a leste no mar. A forja deles está na encosta leste do vulcão.',
  embers: 'Três cristais de brasa. No vulcão eles brotam do chão.',
  fish: 'Quatro peixes. No cais tem cardume, e no mar aberto também.',
  secrets: 'Sob a terra, sob as tábuas, atrás da água que cai. Olhe nas camadas da vila!',
};

/** Market prices (buy). Sell price is half. */
export const PRICES: Partial<Record<ItemId, number>> = { berry: 3, fish: 6, meat: 7, herb: 9, shroom: 6, ember: 18, shell: 12 };
export const STOCK: Record<string, ItemId[]> = { sigrun: ['fish', 'meat'], kael: ['berry', 'herb', 'shroom'], mira: ['shell', 'ember'] };
export const BUYS: Record<string, ItemId[]> = { sigrun: ['fish', 'meat'], kael: ['berry', 'herb', 'shroom', 'shell'], mira: ['relic', 'shell', 'ember'] };
export function sellPrice(i: ItemId): number { return i === 'relic' ? 25 : Math.max(1, Math.floor((PRICES[i] ?? 2) / 2)); }
export function buy(i: ItemId): boolean { const c = PRICES[i] ?? 0; if (items('coin') < c) return false; game.save.player.items.coin -= c; game.addItem(i, 1); return true; }
export function sell(i: ItemId): boolean { if (items(i) <= 0) return false; game.save.player.items[i]--; game.addItem('coin', sellPrice(i)); return true; }
export const swordBonus = (): number => flag('sword');
