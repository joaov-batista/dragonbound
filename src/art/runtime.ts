import type Phaser from 'phaser';
import type { Pix } from './Pix';

/** Upload a Pix canvas as a Phaser texture, optionally registering named frames. */
export function pixToTexture(scene: Phaser.Scene, key: string, pix: Pix, frames?: Record<string, { x: number; y: number; w: number; h: number }>): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, pix.w, pix.h);
  if (!tex) return;
  const img = tex.context.createImageData(pix.w, pix.h);
  img.data.set(pix.data);
  tex.context.putImageData(img, 0, 0);
  if (frames) for (const [name, f] of Object.entries(frames)) tex.add(name, 0, f.x, f.y, f.w, f.h);
  tex.refresh();
}
