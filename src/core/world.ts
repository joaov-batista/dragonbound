import type Phaser from 'phaser';
import type { Body, Rect } from '../physics/Body';
import type { TileGrid } from '../physics/TileGrid';
import type { VfxManager } from '../vfx/VfxManager';
import type { Element } from '../dragons/genetics/types';
import type { IslandData } from '../world/islands/types';

export interface Damageable { body: Body; alive: boolean; hurt(dmg: number, fromX: number, element: Element | 'physical', source: 'player' | 'dragon' | 'enemy' | 'world'): boolean }
export interface ProjectileSpec {
  x: number; y: number; vx: number; vy: number; dmg: number; element: Element | 'physical'; friendly: boolean; fx: string; life?: number; gravity?: number; radius?: number; scale?: number; owner?: unknown;
  /** steer toward this target (turn rate in rad/s) */ seek?: { body: { x: number; y: number; h: number }; alive: boolean } | null; turn?: number;
  /** on impact: area damage, a big element effect, knockback, shake */ aoe?: { r: number; dmg: number; fx: string; scale: number; knock: number; shake: number };
  tint?: number; /** coloured particle trail */ trail?: number; knock?: number; add?: boolean;
}
export interface StrikeOpts { knock?: number; launch?: number }
export interface Foe { body: Body; alive: boolean }

/** What gameplay entities may ask of the scene that hosts them. */
export interface World {
  scene: Phaser.Scene; grid: TileGrid; island: IslandData; vfx: VfxManager;
  hitstop(seconds: number): void; shake(intensity: number, ms?: number): void;
  spawnProjectile(p: ProjectileSpec): void;
  /** Damage everything hostile to `friendly` side inside the rect. Returns number of hits. */
  strike(rect: Rect, dmg: number, element: Element | 'physical', friendly: boolean, fromX: number, source: 'player' | 'dragon' | 'enemy', exclude?: unknown, opts?: StrikeOpts): number;
  /** living foes of the player's side (enemies and bosses) in this lane */
  foes(): Foe[];
  /** full-screen flash over the world (impact frames) */
  flash(ms: number, color: number): void;
  windAt(x: number, y: number): { x: number; y: number };
}
