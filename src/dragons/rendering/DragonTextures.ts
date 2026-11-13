import type Phaser from 'phaser';
import { pixToTexture } from '../../art/runtime';
import { game } from '../../core/state';
import type { DragonRecord } from '../DragonRecord';
import { DRAGON_ANIMS } from './dragonAnims';
import { paintDragonSheet, paintDragonTop } from './DragonPainter';

/** Builds (and caches) the per-individual sprite sheet from DNA. One texture per dragon per growth step. */
export const DragonTextures = {
  key(r: DragonRecord): string { return `dg-${r.genes.id}-${Math.round(game.scale(r) * 16)}`; },
  ensure(scene: Phaser.Scene, r: DragonRecord): string {
    const key = this.key(r);
    if (scene.textures.exists(key)) return key;
    const sheet = paintDragonSheet(game.phenotype(r), game.scale(r));
    pixToTexture(scene, key, sheet.pix, sheet.frames);
    for (const [a, d] of Object.entries(DRAGON_ANIMS)) {
      const ak = `${key}-${a}`;
      if (scene.anims.exists(ak)) scene.anims.remove(ak);
      scene.anims.create({ key: ak, frames: Array.from({ length: d.n }, (_, i) => ({ key, frame: `${a}_${i}` })), frameRate: d.fps, repeat: d.loop ? -1 : 0 });
    }
    return key;
  },
  ensureTop(scene: Phaser.Scene, r: DragonRecord, rider: boolean): string {
    const key = `dgtop-${r.genes.id}-${rider ? 1 : 0}`;
    if (scene.textures.exists(key)) return key;
    const pix = paintDragonTop(game.phenotype(r), game.scale(r), rider);
    pixToTexture(scene, key, pix, { f0: { x: 0, y: 0, w: 64, h: 64 }, f1: { x: 64, y: 0, w: 64, h: 64 }, f2: { x: 128, y: 0, w: 64, h: 64 }, f3: { x: 192, y: 0, w: 64, h: 64 } });
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({ key, frames: ['f0', 'f1', 'f2', 'f1'].map((f) => ({ key, frame: f })), frameRate: 9, repeat: -1 });
    return key;
  },
  /** Free every generated dragon texture (called when a scene shuts down). */
  dispose(scene: Phaser.Scene): void {
    for (const key of scene.textures.getTextureKeys()) if (key.startsWith('dg-') || key.startsWith('dgtop-')) {
      for (const a of Object.keys(DRAGON_ANIMS)) if (scene.anims.exists(`${key}-${a}`)) scene.anims.remove(`${key}-${a}`);
      if (scene.anims.exists(key)) scene.anims.remove(key);
      scene.textures.remove(key);
    }
  },
};
