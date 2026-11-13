import { paintHeroSheet } from '../src/art/hero';
import { saveAtlas, savePng, savePreview } from './png';

const PUB = new URL('../public/', import.meta.url).pathname;
const PREV = process.env.PREVIEW_DIR;

const hero = paintHeroSheet();
savePng(PUB + 'sprites/hero.png', hero.pix);
saveAtlas(PUB + 'sprites/hero.json', 'hero.png', hero.pix, hero.frames);
if (PREV) savePreview(PREV + '/hero.png', hero.pix, 3);

import { paintTileset, TILE } from '../src/art/tiles';
import { THEMES, BIOMES } from '../src/art/themes';
import { paintSky, paintClouds, paintFar, paintMid } from '../src/art/backdrops';
import { Pix } from '../src/art/Pix';

for (const b of BIOMES) {
  const th = THEMES[b];
  const ts = paintTileset(th);
  savePng(`${PUB}tilesets/${b}.png`, ts);
  savePng(`${PUB}tilesets/${b}_sky.png`, paintSky(th));
  savePng(`${PUB}tilesets/${b}_clouds.png`, paintClouds(th, 7));
  savePng(`${PUB}tilesets/${b}_far.png`, paintFar(th, 3));
  savePng(`${PUB}tilesets/${b}_mid.png`, paintMid(th, 5));
  if (PREV) {
    savePreview(`${PREV}/tiles_${b}.png`, ts, 3, 0x202030);
    const comp = new Pix(512, 240), sky = paintSky(th);
    for (let x = 0; x < 512; x += 8) comp.blit(sky, x, 0);
    comp.blit(paintClouds(th, 7), 0, 10); comp.blit(paintFar(th, 3), 0, 50); comp.blit(paintMid(th, 5), 0, 90);
    savePreview(`${PREV}/bg_${b}.png`, comp, 2);
  }
}
void TILE;


import { paintPropAtlas } from '../src/art/props';
const props = paintPropAtlas();
savePng(PUB + 'sprites/props.png', props.pix);
saveAtlas(PUB + 'sprites/props.json', 'props.png', props.pix, props.frames);
if (PREV) savePreview(PREV + '/props.png', props.pix, 2, 0x6fa8c0);


import { paintEnemyAtlas, paintOceanAtlas } from '../src/art/enemies';
import { paintUiAtlas } from '../src/art/ui';
for (const [name, a] of [['enemies', paintEnemyAtlas()], ['ocean', paintOceanAtlas()], ['ui', paintUiAtlas()]] as const) {
  savePng(`${PUB}sprites/${name}.png`, a.pix);
  saveAtlas(`${PUB}sprites/${name}.json`, `${name}.png`, a.pix, a.frames);
  if (PREV) savePreview(`${PREV}/${name}.png`, a.pix, 3, 0x4a7a9a);
}


import { genFont } from './gen-font';
const NM = new URL('../node_modules/@fontsource/', import.meta.url).pathname;
// Jersey 10 (SIL OFL 1.1): native grid is 75 units of 1400 → 18.667px em gives 1 unit = 1 pixel.
genFont(NM + 'jersey-10/files/jersey-10-latin-400-normal.woff', PUB + 'fonts', 'jersey', 1400 / 75, 13, 4);


// PWA icons: a seeded dragon portrait over a dusk gradient, upscaled with crisp pixels.
import { createWild, expressPhenotype, GeneticRegistry } from '../src/dragons/genetics/genome';
import { drawDragon, dragonPose } from '../src/dragons/rendering/DragonPainter';
import { mix } from '../src/art/Pix';
function icon(size: number, pad: number): Pix {
  const base = new Pix(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) base.px(x, y, y > 52 ? mix(0x1f6f9c, 0x2f9fc0, (y - 52) / 12) : mix(0x2a2f6a, 0xf2a04a, Math.pow(y / 52, 1.6)));
  base.ellipse(46, 40, 7, 7, 0xffe6a0);
  const d = new Pix(120, 88);
  drawDragon(d, 0, 0, expressPhenotype(createWild('cinzal', 5, new GeneticRegistry())), 1, dragonPose('alert', 0));
  base.blit(d, -40 + pad, -26 + pad);
  const out = new Pix(size, size), k = size / 64;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.px(x, y, base.get(Math.floor(x / k), Math.floor(y / k)));
  return out;
}
savePng(PUB + 'icons/icon-192.png', icon(192, 0));
savePng(PUB + 'icons/icon-512.png', icon(512, 0));
savePng(PUB + 'icons/icon-maskable-512.png', icon(512, 2));
savePng(PUB + 'icons/apple-touch-icon.png', icon(180, 0));
console.log('assets ok');
