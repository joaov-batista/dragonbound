import { IslandBuilder } from './IslandBuilder';
import type { IslandData } from './types';

/** Ilha de Alvamar — hand-built tropical starting island. */
export function buildStarter(): IslandData {
  const b = new IslandBuilder('alvamar', 'tropical', 420, 96, 60, 1107);
  b.profile([[0, -8], [26, -6], [32, -2], [36, 1], [44, 2], [60, 3], [70, 5], [84, 9], [100, 8], [112, 11], [124, 10], [146, 10], [152, 14], [158, 22], [166, 23],
    [172, 30], [175, 27], [177, 22], [183, 22], [184, 31], [196, 36], [214, 37], [222, 30], [230, 24], [238, 16], [250, 10], [262, 5], [272, 2], [280, -3], [296, -4], [306, 1],
    [318, 3], [340, 4], [356, 2], [372, 1], [380, -2], [390, -6], [419, -9]]).terrain();

  // ruins plaza: level the ground, add broken walls
  for (let x = 124; x <= 146; x++) b.heights[x] = 10;
  b.solidRect(124, b.row(10), 23, 2, 'ruin').bgRect(126, b.row(16), 8, 6, 'ruin').bgRect(139, b.row(14), 6, 4, 'ruin');
  b.solidRect(130, b.row(15), 1, 1, 'ruin').solidRect(131, b.row(16), 3, 1, 'ruin');

  // cliff climb with ledges, waterfall basin, caves
  b.platform(153, 17, 2).platform(156, 20, 2).platform(168, 26, 2);
  b.tunnel([[183, 28], [190, 24], [198, 15], [204, 12]], 2).chamber(206, 12, 9, 5)
    .tunnel([[214, 11], [220, 5], [226, 3]], 2).chamber(230, 3, 9, 5).tunnel([[238, 4], [243, 10], [247, 12]], 2);
  b.platform(203, 15, 3).platform(210, 14, 2);
  b.pool(177, 183, 26, 'water');
  // floating islet (flight-only secret)
  b.blob(104, b.row(31), 5, 2.4, 'earth');
  b.floodSea();

  // docks + boats
  b.dock(30, 38, -1).dock(382, 390, 1);

  // landmarks
  b.prop('sign', 47).spawn((p) => ({ t: 'sign', ...p, text: 'Alvamar. Mova-se, pule e explore. Dragões selvagens vivem aqui: aproxime-se devagar e observe antes de agir.' }), 47);
  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), 56).spawn((p, id) => ({ t: 'campfire', ...p, id }), 190).spawn((p, id) => ({ t: 'campfire', ...p, id }), 330);
  b.prop('arch', 128).prop('pillar', 124).prop('pillar', 135).prop('pillar_broken', 141).prop('pillar', 146).prop('statue', 138).prop('totem', 121);
  b.spawn((p) => ({ t: 'torch', ...p }), 126).spawn((p) => ({ t: 'torch', ...p }), 144);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'shell', n: 2 }), 143);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Ruínas dos Vinculados: "Quem estende a mão sem pressa, recebe asas."' }), 133);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 132, 17);
  b.spawn((p) => ({ t: 'waterfall', x: p.x, y: b.row(31) * 16, h: 6 * 16 }), 184);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Correntes de ar sobem pela face leste do penhasco. Um dragão saberia aproveitá-las.' }), 208);
  b.spawn((p, id) => ({ t: 'nest', ...p, id }), 203);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 212).spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 232, 4)
    .spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 289).spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), 104, 36);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'ember', n: 3 }), 106, 36);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'herb', n: 3 }), 208, 13);

  // food sources
  for (const x of [66, 78, 92, 108, 118, 255, 266, 322, 344]) b.spawn((p, id) => ({ t: 'bush', ...p, id }), x);
  for (const x of [100, 150, 236, 310]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'herb', id }), x);
  for (const x of [200, 227]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'shroom', id }), x, x === 200 ? 13 : 4);
  for (const x of [284, 294, 22]) b.spawn((p, id) => ({ t: 'fishspot', x: p.x, y: 60 * 16, id }), x);
  b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'fish', id }), 302).spawn((p, id) => ({ t: 'pickup', ...p, item: 'shell', id }), 42);

  // wildlife
  for (const x of [62, 352, 366]) b.spawn((p) => ({ t: 'enemy', kind: 'crab', ...p }), x);
  for (const x of [244, 258]) b.spawn((p) => ({ t: 'enemy', kind: 'boar', ...p }), x);
  for (const [x, e] of [[204, 15], [228, 6], [234, 5]] as const) b.spawn((p) => ({ t: 'enemy', kind: 'bat', x: p.x, y: b.row(e) * 16 }), x);
  b.habitat('folhasca', 98, 16, 3).habitat('marulho', 290, 20, 2).habitat('pedrusco', 230, 6, 1, 4);
  b.spawn((p, id) => ({ t: 'trap', ...p, id, species: 'marulho', seed: 77031 }), 316);
  b.spawn((p) => ({ t: 'sign', ...p, text: 'Uma rede de caçadores! Há um dragão preso. Corte a rede com sua lâmina e ofereça algo de comer.' }), 322);

  // updraft on the east cliff face + gentle sea breeze
  b.wind(216, 44, 14, 34, 0, -210).wind(150, 44, 6, 26, 0, -150);
  b.decorate(1);
  return b.build({ name: 'Alvamar', subtitle: 'Ilha do Primeiro Vínculo', startX: 44, weather: 'clear' });
}
