import Phaser from 'phaser';
import { DEBUG, GAME_H, MAX_W, MIN_W } from './core/constants';
import { settings } from './core/settings';
import { game as state } from './core/state';
import { input } from './input/InputManager';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { OceanScene } from './scenes/OceanScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';

/** Fixed 240px-tall pixel canvas; width follows the device aspect ratio (no letterboxing on phones). */
function gameWidth(): number {
  const a = window.innerWidth / Math.max(1, window.innerHeight);
  return Math.max(MIN_W, Math.min(MAX_W, Math.round((GAME_H * a) / 2) * 2));
}

const phaser = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: gameWidth(), height: GAME_H, backgroundColor: '#0c0e1a',
  pixelArt: true, roundPixels: true, antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, limit: settings.fpsCap === 30 ? 30 : 0, smoothStep: true },
  input: { activePointers: 4, keyboard: true, gamepad: false, touch: { capture: true } },
  render: { powerPreference: 'high-performance' },
  scene: [BootScene, TitleScene, IslandScene, OceanScene, UIScene],
});

let resizeT = 0;
const onResize = (): void => { clearTimeout(resizeT); resizeT = window.setTimeout(() => { const w = gameWidth(); if (w !== phaser.scale.width) phaser.scale.setGameSize(w, GAME_H); phaser.scale.refresh(); }, 120); };
window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize);
// keep the browser from scrolling / zooming / opening menus over the game
for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
// save when the tab is hidden or closed (mobile browsers may kill background tabs)
document.addEventListener('visibilitychange', () => { if (document.hidden && phaser.scene.isActive('Island')) void state.persist().catch(() => undefined); });

// PWA: auto-updating service worker. A new deploy is fetched in the background, activates immediately
// and the page reloads once (after saving) — installed apps on phone and desktop never need reinstalling.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        const check = (): void => { if (navigator.onLine) void reg.update().catch(() => undefined); };
        setInterval(check, 20 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      },
    });
    // only reload when a NEW worker replaces an existing one (not on the very first install)
    let reloading = false; const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return; reloading = true;
      void state.persist().catch(() => undefined).finally(() => location.reload());
    });
  });
}
if (DEBUG) Object.assign(window, { __game: phaser, __state: state, __input: input });
