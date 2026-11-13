import { IslandBuilder } from './IslandBuilder';
import type { IslandData } from './types';

/** Agulhas do Trovão — storm island: sea stacks, gales, lightning and swift dragons. */
export function buildStorm(): IslandData {
  const b = new IslandBuilder('trovao', 'storm', 340, 124, 80, 3301);
  b.profile([[0, -9], [20, -6], [28, 2], [44, 4], [52, 16], [64, 18], [66, -5], [74, -5], [76, 26], [92, 28], [94, -6], [104, -6], [106, 38], [128, 42], [132, 30], [150, 30],
    [152, 48], [170, 50], [172, -6], [184, -6], [186, 34], [204, 32], [206, 12], [230, 10], [250, 5], [268, 2], [280, -3], [300, -7], [339, -10]], 0.7).terrain();
  // climbable shafts inside each stack, entered from sea-level ledges
  b.tunnel([[74, 1], [80, 2]], 2).shaft(80, 0, 26).tunnel([[104, 1], [110, 2]], 2).shaft(110, 0, 38)
    .tunnel([[184, 1], [190, 2]], 2).shaft(190, 0, 33).tunnel([[166, 1], [171, 1]], 2).shaft(162, 0, 49);
  b.solidRect(64, b.row(0), 3, 1, 'rock').solidRect(92, b.row(0), 3, 1, 'rock').solidRect(170, b.row(0), 3, 1, 'rock');
  // broken rope bridges
  b.bridge(65, 18, 3).bridge(72, 21, 3).bridge(96, 30, 2).bridge(101, 34, 3).bridge(174, 44, 2).bridge(180, 38, 3);
  b.platform(134, 34, 2).platform(140, 38, 2).platform(146, 43, 3);
  b.chamber(216, 4, 8, 4).tunnel([[206, 8], [210, 5]], 2);
  b.floodSea();
  b.dock(20, 27, -1);

  b.spawn((p) => ({ t: 'sign', ...p, text: 'Agulhas do Trovão. O vento empurra para leste e os raios caem nos cumes. Dentro das agulhas há poços para escalar.' }), 34);
  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), 40).spawn((p, id) => ({ t: 'campfire', ...p, id }), 120).spawn((p, id) => ({ t: 'campfire', ...p, id }), 222);
  for (const [x, e] of [[162, undefined], [198, undefined], [216, 6]] as const) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), x, e);
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'fish', n: 4 }), 126).spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'herb', n: 3 }), 218, 6);
  for (const x of [48, 88, 142, 240, 260]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'herb', id }), x);
  for (const x of [70, 99, 178, 290]) b.spawn((p, id) => ({ t: 'fishspot', x: p.x, y: 80 * 16, id }), x);
  for (const [x, e] of [[84, 32], [138, 40], [196, 40], [224, 16], [112, 46]] as const) b.spawn((p) => ({ t: 'enemy', kind: 'wasp', x: p.x, y: b.row(e) * 16 }), x);
  for (const x of [236, 256]) b.spawn((p) => ({ t: 'enemy', kind: 'crab', ...p }), x);
  b.habitat('trovisco', 160, 9, 2).habitat('trovisco', 118, 10, 1).habitat('geadino', 240, 16, 1);
  b.spawn((p, id) => ({ t: 'nest', ...p, id }), 166);
  // gales: eastward across the gaps, updrafts on windward faces
  b.wind(64, 34, 12, 20, 95, -30).wind(92, 46, 14, 22, 110, -40).wind(170, 58, 16, 30, 120, -20).wind(48, 30, 5, 28, 0, -200).wind(148, 62, 5, 34, 0, -230).wind(202, 44, 5, 34, 0, -180);
  b.decorate(1);
  return b.build({ name: 'Agulhas do Trovão', subtitle: 'Ilha das Tempestades', startX: 32, weather: 'storm' });
}
