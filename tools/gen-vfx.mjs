#!/usr/bin/env node
/**
 * Exports the PixelFx effects used by the game as sprite sheets (PNG + Aseprite-style JSON)
 * into public/vfx, plus a manifest consumed by src/vfx/VfxManager.ts.
 * Source: https://github.com/patch-gg/pixelfx (MIT). Run: npm run assets:vfx
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';


const root = join(dirname(fileURLToPath(import.meta.url)), '../node_modules/pixelfx');
const { loadEffect, renderFrames, spriteSheet } = await import(pathToFileURL(join(root, 'tools/lib/fxlib.mjs')).href);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/vfx');
mkdirSync(OUT, { recursive: true });

/** key → [pixelfx id, fps, options] */
const FX = {
  slash: ['melee/sword-slash', 20], slash2: ['melee/double-slash', 20], cleave: ['melee/heavy-cleave', 20], spin: ['melee/spin-slash', 20], claw: ['melee/claw-swipe', 20],
  hit: ['impacts/hit-spark', 24], crit: ['impacts/crit-hit', 24], parry: ['impacts/parry', 24], slam: ['impacts/ground-slam', 20], land: ['impacts/heavy-landing', 20], block: ['impacts/shield-block', 20],
  explosion: ['explosions/small-explosion', 20], dirt: ['explosions/dirt-explosion', 20], plasma: ['explosions/plasma-explosion', 20], poof: ['spawn/poof', 20],
  firebreath: ['fire/fire-breath', 16], fireball: ['fire/fireball', 16], torch: ['fire/torch', 12], campfire: ['fire/campfire', 12], burning: ['status/burning', 12],
  frostbreath: ['ice/frost-breath', 16], icelance: ['ice/ice-lance', 16], iceshatter: ['ice/ice-shatter', 20], frostnova: ['ice/frost-nova', 20],
  zap: ['lightning/zap-hit', 20], bolt: ['lightning/lightning-strike', 20], sparkarc: ['lightning/spark-arc', 16], thunder: ['lightning/thunderclap', 20],
  waterjet: ['water/water-jet', 16], splash: ['water/splash', 20], ripples: ['water/ripples', 12], bubbles: ['water/bubbles', 12], whirlpool: ['water/whirlpool', 12], wavecrash: ['water/wave-crash', 16],
  leafstorm: ['nature/leaf-storm', 16], spore: ['nature/spore-burst', 16], earthspike: ['nature/earth-spike', 20], quake: ['nature/quake', 20],
  levelup: ['ui/level-up', 20], exclaim: ['ui/exclamation', 16], collect: ['pickups/collect-burst', 24], heal: ['holy/heal', 16], blessing: ['holy/blessing', 16], sleep: ['status/sleep', 8],
};

const MAX_FRAMES = 26, SCALE = 0.66;
const manifest = {};
let bytes = 0;
for (const [key, [id, fps, options]] of Object.entries(FX)) {
  const fx = await loadEffect(id);
  const r = renderFrames(fx, { fps, actor: false, bg: 'none', options });
  // Trim: subsample long effects and crop every frame to the union bounding box (saves VRAM and download).
  const step = Math.ceil(r.frames.length / MAX_FRAMES);
  const kept = r.frames.filter((_, i) => i % step === 0);
  let x0 = r.w, y0 = r.h, x1 = 0, y1 = 0;
  for (const f of kept) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (f.clear[(y * r.w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // PixelFx's stock actor is ~40px tall, our hero ~26px: resample (nearest) so effect pixels match game pixels.
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cw = Math.max(1, Math.round(bw * SCALE)), ch = Math.max(1, Math.round(bh * SCALE));
  const crop = (src) => { const d = new Uint8ClampedArray(cw * ch * 4); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const si = ((Math.min(bh - 1, Math.floor((y + 0.5) / SCALE)) + y0) * r.w + Math.min(bw - 1, Math.floor((x + 0.5) / SCALE)) + x0) * 4; d.set(src.subarray(si, si + 4), (y * cw + x) * 4); } return d; };
  const rr = { w: cw, h: ch, fps: r.fps / step, frames: kept.map((f) => ({ clear: crop(f.clear) })) };
  const s = spriteSheet(fx, rr, key);
  const piv = s.json.meta.pixelfx.pivot; if (piv) s.json.meta.pixelfx.pivot = [Math.round((piv[0] - x0) * SCALE), Math.round((piv[1] - y0) * SCALE)];
  writeFileSync(join(OUT, `${key}.png`), s.png);
  const m = s.json.meta.pixelfx;
  manifest[key] = { id, fps: Math.round(rr.fps * 10) / 10, loop: !!m.loop, frames: m.frames, w: m.frameSize[0], h: m.frameSize[1], cols: m.columns, pivot: m.pivot ?? null };
  bytes += s.png.length;
  console.log(key.padEnd(12), `${m.frames}f ${m.frameSize.join('x')}`);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`total ${(bytes / 1024).toFixed(0)} KB`);
