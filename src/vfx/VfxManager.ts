import Phaser from 'phaser';
import { DEPTH } from '../core/constants';
import { particleScale } from '../core/settings';

export interface VfxMeta { id: string; fps: number; loop: boolean; frames: number; w: number; h: number; cols: number; pivot: [number, number] | null }
export type VfxManifest = Record<string, VfxMeta>;
export interface VfxOpts { flip?: boolean; scale?: number; angle?: number; depth?: number; tint?: number; alpha?: number; follow?: { x: number; y: number }; loop?: boolean; add?: boolean; speed?: number }

const POOL_MAX = 48;

/**
 * Central VFX service. PixelFx effects are pre-rendered to sprite sheets by tools/gen-vfx.mjs
 * (cheaper on mobile than re-uploading a canvas texture every frame) and played through a
 * sprite pool; ambient particles use Phaser emitters scaled by the quality settings.
 */
export class VfxManager {
  private pool: Phaser.GameObjects.Sprite[] = [];
  private live = new Set<Phaser.GameObjects.Sprite>();
  private manifest: VfxManifest;

  /** `onCreate` is called for every object this manager shows (incl. pooled reuse) — the island scene uses it to put effects in the right depth lane. */
  constructor(private scene: Phaser.Scene, private onCreate?: (o: Phaser.GameObjects.GameObject) => void) {
    this.manifest = scene.cache.json.get('vfx-manifest') as VfxManifest;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.pool.length = 0; this.live.clear(); });
  }

  static preload(scene: Phaser.Scene, manifest: VfxManifest): void {
    for (const [key, m] of Object.entries(manifest)) scene.load.spritesheet('fx-' + key, `vfx/${key}.png`, { frameWidth: m.w, frameHeight: m.h });
  }
  static createAnims(scene: Phaser.Scene, manifest: VfxManifest): void {
    for (const [key, m] of Object.entries(manifest)) {
      if (scene.anims.exists('fx-' + key)) continue;
      scene.anims.create({ key: 'fx-' + key, frames: scene.anims.generateFrameNumbers('fx-' + key, { start: 0, end: m.frames - 1 }), frameRate: m.fps, repeat: m.loop ? -1 : 0 });
    }
  }

  get activeCount(): number { return this.live.size; }

  /** Play a one-shot (or looping) PixelFx effect anchored at its pivot. Returns the sprite, or null if over budget. */
  play(key: string, x: number, y: number, o: VfxOpts = {}): Phaser.GameObjects.Sprite | null {
    const m = this.manifest[key];
    if (!m) return null;
    const loop = o.loop ?? m.loop;
    if (!loop && this.live.size >= Math.max(10, POOL_MAX * particleScale())) return null;
    const s = this.pool.pop() ?? this.scene.add.sprite(0, 0, 'fx-' + key);
    s.setTexture('fx-' + key, 0).setActive(true).setVisible(true);
    const [px, py] = m.pivot ?? [m.w / 2, m.h / 2];
    s.setOrigin((o.flip ? m.w - px : px) / m.w, py / m.h);
    s.setFlipX(!!o.flip).setScale(o.scale ?? 1).setAngle(o.angle ?? 0).setDepth(o.depth ?? DEPTH.vfx).setAlpha(o.alpha ?? 1);
    s.setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (o.tint !== undefined) s.setTint(o.tint); else s.clearTint();
    s.setPosition(Math.round(x), Math.round(y));
    s.setData('follow', o.follow ?? null); s.setData('off', o.follow ? [x - o.follow.x, y - o.follow.y] : null);
    s.anims.timeScale = o.speed ?? 1;
    s.play({ key: 'fx-' + key, repeat: loop ? -1 : 0 });
    this.onCreate?.(s);
    this.live.add(s);
    if (!loop) s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(s));
    return s;
  }

  release(s: Phaser.GameObjects.Sprite | null): void {
    if (!s || !this.live.has(s)) return;
    this.live.delete(s); s.anims.stop(); s.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    s.setActive(false).setVisible(false);
    if (this.pool.length < POOL_MAX) this.pool.push(s); else s.destroy();
  }

  update(): void {
    for (const s of this.live) {
      const f = s.getData('follow') as { x: number; y: number } | null;
      if (f) { const off = s.getData('off') as [number, number]; s.setPosition(Math.round(f.x + off[0]), Math.round(f.y + off[1])); }
    }
  }

  /** Small burst of coloured pixels (dust, sparks, leaves, droplets) from the shared white texture. */
  puff(x: number, y: number, color: number, n = 6, o: { speed?: number; up?: number; life?: number; gravity?: number; spread?: number; depth?: number; size?: number; add?: boolean } = {}): void {
    const count = Math.max(1, Math.round(n * particleScale()));
    const em = this.scene.add.particles(x, y, 'ui', {
      frame: 'white', lifespan: { min: (o.life ?? 420) * 0.5, max: o.life ?? 420 }, speed: { min: (o.speed ?? 50) * 0.3, max: o.speed ?? 50 },
      angle: { min: -90 - (o.spread ?? 80), max: -90 + (o.spread ?? 80) }, gravityY: o.gravity ?? 200, scale: { start: (o.size ?? 2) / 4, end: 0.25 }, alpha: { start: 1, end: 0 },
      tint: color, emitting: false, blendMode: o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
    });
    em.setDepth(o.depth ?? DEPTH.vfx);
    this.onCreate?.(em);
    em.explode(count);
    this.scene.time.delayedCall((o.life ?? 420) + 60, () => em.destroy());
  }

  /** Floating number / word (damage, +trust). */
  floatText(x: number, y: number, text: string, color = 0xffffff): void {
    const t = this.scene.add.bitmapText(Math.round(x), Math.round(y), 'jersey', text).setOrigin(0.5, 1).setTint(color).setDepth(DEPTH.vfx + 5);
    this.onCreate?.(t);
    this.scene.tweens.add({ targets: t, y: y - 22, alpha: { from: 1, to: 0 }, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }
}
