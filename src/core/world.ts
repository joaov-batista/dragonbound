import type Phaser from 'phaser';
import type { Body, Rect } from '../physics/Body';
import type { TileGrid } from '../physics/TileGrid';
import type { VfxManager } from '../vfx/VfxManager';
import type { Element } from '../dragons/genetics/types';
import type { IslandData } from '../world/islands/types';

export interface Damageable { body: Body; alive: boolean; hurt(dmg: number, fromX: number, element: Element | 'physical', source: 'player' | 'dragon' | 'enemy' | 'world'): boolean }
export interface ProjectileSpec { x: number; y: number; vx: number; vy: number; dmg: number; element: Element | 'physical'; friendly: boolean; fx: string; life?: number; gravity?: number; radius?: number; scale?: number; owner?: unknown }

/** What gameplay entities may ask of the scene that hosts them. */
export interface World {
  scene: Phaser.Scene; grid: TileGrid; island: IslandData; vfx: VfxManager;
  hitstop(seconds: number): void; shake(intensity: number, ms?: number): void;
  spawnProjectile(p: ProjectileSpec): void;
  /** Damage everything hostile to `friendly` side inside the rect. Returns number of hits. */
  strike(rect: Rect, dmg: number, element: Element | 'physical', friendly: boolean, fromX: number, source: 'player' | 'dragon' | 'enemy', exclude?: unknown): number;
  windAt(x: number, y: number): { x: number; y: number };
}
