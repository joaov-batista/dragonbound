import { IslandBuilder } from './IslandBuilder';
import type { IslandData } from './types';

/** Ilha de Alvamar — hand-built tropical starting island. */
export function buildStarter(): IslandData {
  const b = new IslandBuilder('alvamar', 'tropical', 420, 96, 60, 1107);
  b.profile([[0, -8], [26, -6], [32, -2], [36, 1], [40, 3], [78, 3], [87, 10], [124, 10], [146, 10], [152, 14], [158, 22], [166, 23],
    [172, 30], [175, 27], [177, 22], [183, 22], [184, 31], [196, 36], [214, 37], [222, 30], [230, 24], [238, 16], [250, 10], [262, 5], [272, 2], [280, -3], [296, -4], [306, 1],
    [318, 3], [340, 4], [356, 2], [372, 1], [380, -2], [390, -6], [419, -9]]);

  // Vigiamar: a flat harbour plaza and an upper terrace for the Great Hall; ruins plaza further east
  for (let x = 40; x <= 78; x++) b.heights[x] = 3;
  for (let x = 87; x <= 146; x++) b.heights[x] = 10;
  for (let x = 318; x <= 376; x++) b.heights[x] = 3; // hunters' camp clearing
  b.terrain();
  b.solidRect(124, b.row(10), 23, 2, 'ruin').bgRect(126, b.row(16), 8, 6, 'ruin').bgRect(139, b.row(14), 6, 4, 'ruin');
  b.solidRect(130, b.row(15), 1, 1, 'ruin').solidRect(131, b.row(16), 3, 1, 'ruin');

  // cliff climb with ledges, waterfall basin, caves
  b.platform(153, 17, 2).platform(156, 20, 2).platform(168, 26, 2);
  b.tunnel([[183, 28], [190, 24], [198, 15], [204, 12]], 2).chamber(206, 12, 9, 5)
    .tunnel([[214, 11], [220, 5], [226, 3]], 2).chamber(230, 3, 9, 5).tunnel([[238, 4], [243, 10], [247, 12]], 2);
  b.platform(203, 15, 3).platform(210, 14, 2);
  b.pool(177, 183, 26, 'water');
  // secret: an alcove behind the waterfall
  b.tunnel([[184, 28], [188, 28]], 1.2).chamber(189, 28, 2, 1.4);
  // floating islet (flight-only secret)
  b.blob(136, b.row(31), 5, 2.4, 'earth');
  b.floodSea();

  // docks + boats
  b.dock(30, 38, -1).dock(382, 390, 1);

  // landmarks
  // ── Vigiamar (main lane: Praça) ──
  b.prop('sign', 42).spawn((p) => ({ t: 'sign', ...p, text: 'Vigiamar, vila dos Vinculados. Q e Z trocam de camada: a Rua das Casas fica ao fundo e o Mercado do Cais à frente.' }), 42);
  b.prop('forge', 48).prop('barrels', 53).prop('well', 58).prop('board', 63).prop('lamp', 45).prop('lamp', 67).prop('cart', 70).prop('tower', 75).prop('fence', 82, { elev: 7 });
  b.prop('longhouse', 101).prop('lamp', 92).prop('lamp', 110).prop('stable', 117).prop('hay', 114).prop('barrels', 122);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Quadro de avisos: "Procura-se coragem. Caçadores de Escama avistados a leste. — Chefe Ragna"' }), 63);
  b.spawn((p) => ({ t: 'torch', ...p }), 96).spawn((p) => ({ t: 'torch', ...p }), 106);
  for (const [who, x, range] of [['tor', 37, 2], ['olvar', 50, 2], ['ivo', 60, 9], ['lia', 66, 8], ['halvar', 76, 2], ['ragna', 100, 4], ['bjarni', 116, 4]] as const) b.spawns.push({ t: 'npc', who, ...b.at(x), range });
  b.spawns.push({ t: 'pickup', ...b.floorAt(189, 28), item: 'relic', id: 'alvamar:secret_falls', secret: 'secret_falls' });
  // ── hunters' camp (east) ──
  b.prop('palisade', 331).prop('banner_hunter', 335).prop('tent', 341).prop('cage', 347).prop('netpile', 353).prop('tent', 359).prop('barrels', 364).prop('banner_hunter', 369).prop('palisade', 374);
  b.spawn((p) => ({ t: 'torch', ...p }), 345).spawn((p) => ({ t: 'torch', ...p }), 362);
  b.spawns.push({ t: 'trigger', flag: 'reached_camp', x0: 326 * 16, x1: 334 * 16 }, { t: 'trigger', flag: 'saw_trap', x0: 308 * 16, x1: 322 * 16 });
  b.spawns.push({ t: 'boss', boss: 'bruto', ...b.at(356), arena: [332, 375] });
  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), 55).spawn((p, id) => ({ t: 'campfire', ...p, id }), 190).spawn((p, id) => ({ t: 'campfire', ...p, id }), 304);
  b.prop('arch', 128).prop('pillar', 124).prop('pillar', 135).prop('pillar_broken', 141).prop('pillar', 146).prop('statue', 138).prop('totem', 121);
  b.spawn((p) => ({ t: 'torch', ...p }), 126).spawn((p) => ({ t: 'torch', ...p }), 144);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'shell', n: 2 }), 143);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Ruínas dos Vinculados: "Quem estende a mão sem pressa, recebe asas."' }), 133);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 132, 17);
  b.spawn((p) => ({ t: 'waterfall', x: p.x, y: b.row(31) * 16, h: 6 * 16 }), 184);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Correntes de ar sobem pela face leste do penhasco. Um dragão saberia aproveitá-las.' }), 208);
  b.spawn((p, id) => ({ t: 'nest', ...p, id }), 203);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 212).spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 232, 4)
    .spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 289).spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 136, 36);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'ember', n: 3 }), 138, 36);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'herb', n: 3 }), 208, 13);

  // food sources
  for (const x of [130, 150, 255, 266, 300]) b.spawn((p, id) => ({ t: 'bush', ...p, id }), x);
  for (const x of [160, 236, 310]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'herb', id }), x);
  for (const x of [200, 227]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'shroom', id }), x, x === 200 ? 13 : 4);
  for (const x of [284, 294, 22]) b.spawn((p, id) => ({ t: 'fishspot', x: p.x, y: 60 * 16, id }), x);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'fish', id }), 302).spawn((p, id) => ({ t: 'pickup', ...p, item: 'shell', id }), 42);

  // wildlife
  for (const x of [292, 386]) b.spawn((p) => ({ t: 'enemy', kind: 'crab', ...p }), x);
  for (const x of [338, 348, 366]) b.spawn((p) => ({ t: 'enemy', kind: 'hunter', ...p }), x);
  for (const x of [244, 258]) b.spawn((p) => ({ t: 'enemy', kind: 'boar', ...p }), x);
  for (const [x, e] of [[204, 15], [228, 6], [234, 5]] as const) b.spawn((p) => ({ t: 'enemy', kind: 'bat', x: p.x, y: b.row(e) * 16 }), x);
  b.habitat('folhasca', 262, 14, 3).habitat('marulho', 290, 20, 2).habitat('pedrusco', 230, 6, 1, 4);
  b.spawn((p, id) => ({ t: 'trap', ...p, id, species: 'marulho', seed: 77031 }), 316);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Uma rede de caçadores! Há um dragão preso. Corte a rede com sua lâmina e ofereça algo de comer.' }), 322);

  // updraft on the east cliff face + gentle sea breeze
  b.wind(216, 44, 14, 34, 0, -210).wind(150, 44, 6, 26, 0, -150);
  b.decorate(1);
  const d = b.build({ name: 'Alvamar', subtitle: 'Vigiamar, vila dos Vinculados', startX: 56, weather: 'clear' });
  d.laneHooks = {
    // Fundo: Rua das Casas — a raised street of homes, with a cellar hidden behind the red-door house
    [-1]: {
      reserve: [30, 128],
      heights: (h) => { for (let x = 30; x <= 128; x++) h[x] = x < 34 ? 2 + (x - 30) : x > 124 ? 6 + (x - 124) * 2 : 6; },
      build: (lb) => {
        lb.prop('house_a', 42).prop('house_b', 55).prop('house_c', 68).prop('house_a', 84).prop('house_b', 98).prop('house_c', 112);
        for (const x of [49, 62, 76, 91, 105, 119]) lb.prop('lamp', x);
        lb.prop('barrels', 80).prop('hay', 94).prop('fence', 124).prop('cart', 33);
        lb.tunnel([[70, 6], [72, 4], [76, 3]], 1.6).chamber(80, 3, 4, 1.8);
        lb.spawns.push({ t: 'pickup', ...lb.floorAt(81, 4), item: 'relic', id: 'alvamar~b:secret_cellar', secret: 'secret_cellar' });
        lb.spawns.push({ t: 'chest', ...lb.floorAt(78, 4), id: 'alvamar~b:cellarchest', loot: 'coin', n: 30 });
        for (const [who, x, range] of [['ingrid', 86, 3]] as const) lb.spawns.push({ t: 'npc', who, ...lb.at(x), range });
      },
    },
    // Frente: Mercado do Cais — stalls along the beach; something hides under the boardwalk
    [1]: {
      reserve: [26, 100],
      heights: (h) => { for (let x = 30; x <= 100; x++) h[x] = x > 96 ? 1 + (x - 96) : 1; },
      build: (lb) => {
        lb.prop('stall_fish', 44).prop('stall_fruit', 56).prop('stall_maps', 68).prop('stall_tools', 80);
        lb.prop('barrels', 50).prop('crate', 62).prop('cart', 74).prop('lamp', 38).prop('lamp', 62).prop('lamp', 86).prop('netpile', 33);
        lb.platform(86, 4, 9);
        lb.tunnel([[88, 1], [90, 0], [94, 0]], 1.1).chamber(96, 0, 2.5, 1.2);
        lb.spawns.push({ t: 'pickup', ...lb.floorAt(96, 1), item: 'relic', id: 'alvamar~f:secret_pier', secret: 'secret_pier' });
        for (const [who, x, range] of [['sigrun', 44, 1], ['kael', 56, 1], ['mira', 68, 1]] as const) lb.spawns.push({ t: 'npc', who, ...lb.at(x), range });
      },
    },
  };
  return d;
}
