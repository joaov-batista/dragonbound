import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { DEPTH, GAME_H } from '../core/constants';
import { particleScale } from '../core/settings';
import type { WeatherId } from './islands/types';

type Em = Phaser.GameObjects.Particles.ParticleEmitter;

/** Screen-space weather particles + storm lightning scheduling. */
export class WeatherFx {
  private rain: Em; private drift: Em; private embers: Em; private flies: Em;
  private boltT = 4; private warn: { x: number; y: number; t: number } | null = null;
  intensity = 0;
  constructor(private scene: Phaser.Scene, readonly kind: WeatherId, biome: string) {
    const W = 600, mk = (cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Em => scene.add.particles(0, 0, 'ui', { frame: 'white', emitting: true, ...cfg }).setScrollFactor(0).setDepth(DEPTH.weather);
    this.rain = mk({ x: { min: -40, max: W }, y: -6, lifespan: 620, speedY: { min: 380, max: 460 }, speedX: { min: -110, max: -70 }, scaleX: 0.25, scaleY: { min: 1.5, max: 3 }, tint: 0xb8d0f0, alpha: 0.55, frequency: -1 });
    this.drift = mk({ x: { min: 0, max: W }, y: -4, lifespan: 5200, speedY: { min: 14, max: 34 }, speedX: { min: -30, max: 10 }, scale: { min: 0.25, max: 0.5 }, rotate: { min: 0, max: 360 },
      tint: biome === 'volcanic' ? [0x8a7a80, 0x5a4a52] : biome === 'storm' ? [0x6a8a80, 0x8aa0b0] : [0x8fd070, 0xf0e890, 0xf4b8c8], alpha: { start: 0.9, end: 0 }, frequency: -1 });
    this.embers = mk({ x: { min: 0, max: W }, y: GAME_H + 4, lifespan: 2600, speedY: { min: -70, max: -30 }, speedX: { min: -20, max: 20 }, scale: { start: 0.5, end: 0.2 }, tint: [0xffb040, 0xff7020], alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, frequency: -1 });
    this.flies = mk({ x: { min: 0, max: W }, y: { min: 40, max: GAME_H - 20 }, lifespan: 3600, speed: { min: 4, max: 14 }, scale: 0.5, tint: 0xf8f090, alpha: { start: 0, end: 0.9, ease: 'Sine.easeInOut' }, blendMode: Phaser.BlendModes.ADD, frequency: -1 });
  }

  /** Returns a lightning strike position when one lands this frame. */
  update(dt: number, night: number, covered: boolean, pickStrike: () => { x: number; y: number } | null, onWarn: (x: number, y: number) => void): { x: number; y: number } | null {
    const k = particleScale(), rainy = this.kind === 'rain' || this.kind === 'storm';
    this.intensity = rainy ? (this.kind === 'storm' ? 1 : 0.55) : 0;
    const emit = (e: Em, perSec: number): void => { let n = perSec * dt * k; while (n > 0) { if (n >= 1 || Math.random() < n) e.emitParticle(1); n -= 1; } };
    if (!covered) { emit(this.rain, this.intensity * 150); emit(this.drift, this.kind === 'ash' ? 9 : rainy ? 2 : 3.5); }
    if (this.kind === 'ash') emit(this.embers, 5);
    if (night > 0.5 && !rainy) emit(this.flies, 3 * night);
    if (this.kind !== 'storm') return null;
    if (this.warn) {
      if ((this.warn.t -= dt) <= 0) { const p = { x: this.warn.x, y: this.warn.y }; this.warn = null; this.scene.cameras.main.flash(140, 235, 235, 255); audio.play('thunder'); return p; }
      return null;
    }
    if ((this.boltT -= dt) <= 0) {
      this.boltT = 3.5 + Math.random() * 6;
      const p = pickStrike();
      if (p) { this.warn = { ...p, t: 0.9 }; onWarn(p.x, p.y); } else { this.scene.cameras.main.flash(100, 200, 205, 235); audio.play('thunder', 0.5); }
    }
    return null;
  }
}
