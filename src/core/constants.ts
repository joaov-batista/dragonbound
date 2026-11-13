export const TILE = 16;
export const GAME_H = 240;
export const MIN_W = 320, MAX_W = 560;
export const SAVE_VERSION = 2;
export const DAY_LENGTH = 720; // seconds per in-game day
export const DEPTH = { sky: -100, far: -90, mid: -80, bgTiles: -20, propsBack: -10, entities: 0, player: 10, fgTiles: 20, propsFront: 30, liquid: 35, vfx: 40, weather: 60, light: 70, tint: 80 } as const;
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
