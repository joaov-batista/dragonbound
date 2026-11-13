import { IslandBuilder } from './IslandBuilder';
import type { IslandData } from './types';

/** Monte Brasaviva — volcanic island: lava, basalt, forges and fire dragons. */
export function buildVolcanic(): IslandData {
  const b = new IslandBuilder('brasaviva', 'volcanic', 340, 112, 72, 2203);
  b.profile([[0, -8], [22, -6], [30, -2], [34, 1], [50, 3], [70, 8], [90, 14], [110, 24], [126, 36], [140, 44], [146, 46], [149, 38], [166, 38], [169, 46], [176, 44], [190, 34],
    [210, 22], [230, 14], [250, 9], [270, 5], [290, 2], [304, -2], [312, -6], [339, -9]], 0.9).terrain();
  // lava: crater lake and two rivers crossing the slopes
  b.pool(149, 168, 42, 'lava');
  b.notch(78, 84, 3).pool(78, 84, b.heights[77] - 1, 'lava').platform(80, b.heights[77] + 2, 3);
  b.notch(236, 243, 3).pool(236, 243, b.heights[244], 'lava').platform(238, b.heights[244] + 3, 2).platform(241, b.heights[244] + 4, 2);
  // caves: lava tube → old forge → eastern exit
  b.tunnel([[97, 15], [108, 13], [118, 15]], 2).chamber(128, 16, 11, 6, 'ruin').tunnel([[138, 15], [160, 12], [182, 14], [200, 16], [213, 21]], 2).chamber(170, 12, 8, 4);
  b.solidRect(124, b.row(12), 8, 1, 'ruin').platform(133, 18, 3);
  b.notch(166, 173, 1);
  b.floodSea();
  b.dock(24, 32, -1);

  b.spawn((p) => ({ t: 'sign', ...p, text: 'Monte Brasaviva. A lava queima — os Cinzais não se importam. Cristais de brasa são o petisco favorito deles.' }), 40);
  b.spawn((p, id) => ({ t: 'campfire', ...p, id }), 46).spawn((p, id) => ({ t: 'campfire', ...p, id }), 204);
  b.spawn((p) => ({ t: 'torch', ...p }), 122, 14).spawn((p) => ({ t: 'torch', ...p }), 134, 14);
  b.prop('statue', 128, { elev: 14 }).prop('pillar', 121, { elev: 14 }).prop('pillar_broken', 136, { elev: 14 });
  b.spawn((p, id) => ({ t: 'chest', ...p, id, loot: 'ember', n: 4 }), 131, 14);
  for (const [x, e] of [[147, undefined], [128, 20], [262, undefined]] as const) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'relic', id }), x, e);
  for (const x of [58, 92, 104, 186, 222, 256, 278]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'ember', id }), x);
  for (const x of [166, 176]) b.spawn((p, id) => ({ t: 'pickup', ...p, item: 'ember', id }), x, 13);
  for (const x of [116, 196]) { b.spawn((p) => ({ t: 'vent', ...p }), x); b.prop('lavavent', x); b.wind(x - 2, b.heights[x] + 30, 5, 30, 0, -230); }
  for (const x of [72, 100, 220, 248, 270]) b.spawn((p) => ({ t: 'enemy', kind: 'magma', ...p }), x);
  for (const [x, e] of [[110, 15], [150, 14], [190, 16]] as const) b.spawn((p) => ({ t: 'enemy', kind: 'bat', x: p.x, y: b.row(e) * 16 }), x);
  b.habitat('cinzal', 186, 18, 2).habitat('cinzal', 60, 12, 1).habitat('pedrusco', 170, 6, 1, 12);
  b.spawn((p, id) => ({ t: 'nest', ...p, id }), 174);
  b.light(158, 42, 220, 0xff5a20);
  b.decorate(1);
  return b.build({ name: 'Monte Brasaviva', subtitle: 'Ilha Vulcânica', startX: 38, weather: 'ash' });
}
