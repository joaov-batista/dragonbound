/**
 * Rasterises an OFL pixel TTF/WOFF into a Phaser bitmap font (PNG + BMFont XML) by sampling
 * glyph outlines at pixel centres on the font's native grid — crisp, no antialiasing.
 */
import opentype from 'opentype.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { Pix } from '../src/art/Pix';
import { savePng } from './png';

const CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'ÁÀÂÃÄÉÊÈÍÓÔÕÚÜÇáàâãäéêèíóôõúüçñÑºª°«»–—…×·';

export function genFont(src: string, outBase: string, name: string, px: number, ascPx?: number, descPx?: number): void {
  const buf = readFileSync(src);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const scale = px / font.unitsPerEm;
  const asc = ascPx ?? Math.ceil(font.ascender * scale), desc = descPx ?? Math.ceil(-font.descender * scale), lineH = asc + desc;
  const cellW = Math.ceil(px * 0.8) + 2, cols = 16, rows = Math.ceil(CHARS.length / cols);
  const pix = new Pix(cols * cellW, rows * (lineH + 1));
  let xml = `<?xml version="1.0"?><font><info face="${name}" size="16"/><common lineHeight="${lineH + 1}" base="${asc}" scaleW="${pix.w}" scaleH="${pix.h}" pages="1"/><pages><page id="0" file="${name}.png"/></pages><chars count="${CHARS.length}">`;
  [...CHARS].forEach((ch, i) => {
    const g = font.charToGlyph(ch);
    const path = g.getPath(0, 0, px);
    // flatten to polygons
    const polys: [number, number][][] = []; let cur: [number, number][] = [];
    for (const c of path.commands) {
      if (c.type === 'M') { if (cur.length) polys.push(cur); cur = [[c.x, c.y]]; }
      else if (c.type === 'L') cur.push([c.x, c.y]);
      else if (c.type === 'Q' || c.type === 'C') { const [x0, y0] = cur[cur.length - 1]; for (let t = 0.25; t <= 1; t += 0.25) cur.push([x0 + (c.x - x0) * t, y0 + (c.y - y0) * t]); }
      else if (c.type === 'Z') { if (cur.length) polys.push(cur); cur = []; }
    }
    if (cur.length) polys.push(cur);
    const adv = Math.max(1, Math.round((g.advanceWidth ?? font.unitsPerEm / 2) * scale));
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * (lineH + 1);
    for (let y = -asc; y < desc; y++)
      for (let x = 0; x < cellW - 1; x++) {
        const sx = x + 0.5, sy = y + 0.5; let wind = 0;
        for (const poly of polys) for (let k = 0; k < poly.length; k++) {
          const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
          if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) { const ix = x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0); if (ix > sx) wind += y1 > y0 ? 1 : -1; }
        }
        if (wind !== 0) pix.px(cx + x, cy + y + asc, 0xffffff);
      }
    xml += `<char id="${ch.codePointAt(0)}" x="${cx}" y="${cy}" width="${Math.min(cellW - 1, adv + 1)}" height="${lineH}" xoffset="0" yoffset="0" xadvance="${adv}" page="0"/>`;
  });
  xml += '</chars></font>';
  savePng(`${outBase}/${name}.png`, pix);
  writeFileSync(`${outBase}/${name}.xml`, xml);
}
