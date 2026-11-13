import { events } from './events';

export type Quality = 'low' | 'medium' | 'high';
export interface Settings {
  master: number; music: number; sfx: number; ambience: number; voices: number;
  quality: Quality; particles: number; fpsCap: 30 | 60; showFps: boolean; screenShake: number;
  touchOpacity: number; touchScale: number; touchEnabled: 'auto' | 'on' | 'off';
  /** Custom positions for touch widgets, normalised to the safe viewport (0..1), keyed by widget id and mode. */
  touchLayout: Record<string, { x: number; y: number }>;
  /** how many bonded dragons may follow the player at once (1..6) */
  maxFollowers: number;
  /** flight camera: zoom out with speed and shake on dives (0 = off, 1 = full) */
  flightCam: number;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6, voices: 0.8,
  quality: 'high', particles: 1, fpsCap: 60, showFps: false, screenShake: 1,
  touchOpacity: 0.75, touchScale: 1, touchEnabled: 'auto', touchLayout: {},
  maxFollowers: 3, flightCam: 1,
};

const KEY = 'dragonbound.settings.v1';
function load(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* corrupted or unavailable storage: fall back to defaults */ }
  return { ...DEFAULT_SETTINGS, touchLayout: {} };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage full / private mode */ }
  events.emit('settingsChanged');
}

/** Particle budget multiplier derived from quality + user slider. */
export function particleScale(): number {
  return settings.particles * (settings.quality === 'low' ? 0.35 : settings.quality === 'medium' ? 0.7 : 1);
}
