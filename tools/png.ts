import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Pix } from '../src/art/Pix';

export function savePng(path: string, pix: Pix, scale = 1): void {
  const png = new PNG({ width: pix.w * scale, height: pix.h * scale });
  if (scale === 1) png.data.set(pix.data);
  else
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        const s = (Math.floor(y / scale) * pix.w + Math.floor(x / scale)) * 4, d = (y * png.width + x) * 4;
        for (let k = 0; k < 4; k++) png.data[d + k] = pix.data[s + k];
      }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

export type Rects = Record<string, { x: number; y: number; w: number; h: number }>;
/** Phaser "JSON Hash" atlas. */
export function saveAtlas(path: string, image: string, pix: Pix, frames: Rects): void {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(frames))
    out[k] = { frame: f, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h } };
  writeFileSync(path, JSON.stringify({ frames: out, meta: { image, size: { w: pix.w, h: pix.h }, scale: '1' } }));
}

/** Preview on a flat background for visual review (not shipped). */
export function savePreview(path: string, pix: Pix, scale: number, bg = 0x4a6a7a): void {
  const png = new PNG({ width: pix.w * scale, height: pix.h * scale });
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const s = (Math.floor(y / scale) * pix.w + Math.floor(x / scale)) * 4, d = (y * png.width + x) * 4;
      const a = pix.data[s + 3] / 255;
      png.data[d] = pix.data[s] * a + ((bg >> 16) & 255) * (1 - a);
      png.data[d + 1] = pix.data[s + 1] * a + ((bg >> 8) & 255) * (1 - a);
      png.data[d + 2] = pix.data[s + 2] * a + (bg & 255) * (1 - a);
      png.data[d + 3] = 255;
    }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}
