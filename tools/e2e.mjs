#!/usr/bin/env node
/**
 * End-to-end smoke test in headless Chromium (Playwright). Builds must exist: `npm run build`.
 * Drives the real game through keyboard / touch input and the ?debug hooks, asserts on live
 * state and writes screenshots to tests/screenshots/. Run: npm run e2e
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR ?? join(ROOT, 'tests/screenshots');
const PORT = 4188, URL = `http://localhost:${PORT}/?debug=1`;
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, ms = 8000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch { /* scene swapping */ } await sleep(100); }
  return false;
}

async function main() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch { /* not up yet */ } await sleep(250); }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];

  // ── desktop: keyboard ────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 960, height: 480 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(URL);
  check('game boots to the title screen', await waitFor(page, () => window.__game?.scene.isActive('Title')));
  await sleep(600); await page.screenshot({ path: join(SHOTS, '01-title.png') });
  await page.evaluate(() => { window.__state.newGame(4242); window.__game.scene.getScene('Title').scene.start('Island', { islandId: 'alvamar', entry: 'load' }); });
  check('island scene loads', await waitFor(page, () => window.__scene?.player && window.__scene.dragons.length > 0));
  await sleep(1500);
  const S = (fn, arg) => page.evaluate(fn, arg);
  const pos = () => S(() => ({ x: window.__scene.player.body.x, y: window.__scene.player.body.y, g: window.__scene.player.body.onGround, hp: window.__state.save.player.hp }));

  // movement + collisions
  const p0 = await pos();
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  const p1 = await pos();
  check('player walks right with the keyboard', p1.x > p0.x + 50, `dx=${Math.round(p1.x - p0.x)}`);
  check('player stands on solid ground (tile collision)', p1.g && await S(() => { const s = window.__scene, b = s.player.body; return s.grid.solidPx(b.x, b.y + 4) && !s.grid.solidPx(b.x, b.y - 8); }));
  await page.keyboard.press('Space'); await sleep(220);
  const pj = await pos(); await sleep(900);
  check('player jumps and lands', pj.y < p1.y - 12 && (await pos()).g, `rise=${Math.round(p1.y - pj.y)}`);
  await page.keyboard.press('KeyK'); await sleep(60);
  check('dash state triggers', await S(() => window.__scene.player.state === 'dash'));
  await sleep(400); await page.screenshot({ path: join(SHOTS, '02-island-start.png') });

  // combat: put a crab in front and swing
  await S(() => { const s = window.__scene, e = s.enemies.find((x) => x.kind === 'crab'), b = s.player.body; e.body.x = b.x + 26; e.body.y = b.y; e.body.vx = 0; window.__crab = e; s.player.facing = 1; });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await sleep(190); }
  await page.screenshot({ path: join(SHOTS, '03-combat.png') });
  check('sword combo damages / kills an enemy', await S(() => !window.__crab.alive || window.__crab.hp < 3));
  // parry
  await S(() => { const s = window.__scene, e = s.enemies.find((x) => x.alive && x.kind === 'crab'), b = s.player.body; if (e) { e.body.x = b.x + 70; e.body.y = b.y; } window.__hp = window.__state.save.player.hp; });
  await sleep(600); await page.keyboard.press('KeyL'); await sleep(80);
  check('parry stance opens a parry window', await S(() => window.__scene.player.state === 'parry' && window.__scene.player.parryWindow > 0));
  await sleep(600);

  // ── dragons: unique DNA, behaviour, taming ───────────────────────────
  const dna = await S(() => { const s = window.__scene; return s.dragons.map((d) => ({ id: d.rec.genes.id, sp: d.rec.genes.species, name: d.rec.name, c: d.ph.primary, head: d.ph.head, wings: d.ph.wings })); });
  check('island has wild dragons with distinct identities', dna.length >= 6 && new Set(dna.map((d) => d.id)).size === dna.length, `${dna.length} dragões`);
  // find a calm marulho (not the trapped one), approach on foot
  await S(() => { const s = window.__scene, d = s.dragons.find((x) => x.rec.genes.species === 'folhasca'); window.__d = d; d.build?.(); const b = s.player.body; b.x = d.body.x - 150; b.y = d.body.y - 20; b.vx = b.vy = 0; });
  await sleep(1500); await page.screenshot({ path: join(SHOTS, '04-wild-dragon.png') });
  // running at it raises fear
  const f0 = await S(() => window.__d.rec.fear);
  await page.keyboard.down('KeyD'); await sleep(1300); await page.keyboard.up('KeyD');
  const f1 = await S(() => ({ fear: window.__d.rec.fear, state: window.__d.intent?.state }));
  check('running at a wild dragon frightens it', f1.fear > f0 + 8, `medo ${Math.round(f0)}→${Math.round(f1.fear)} (${f1.state})`);
  await page.screenshot({ path: join(SHOTS, '05-startled.png') });

  // the trapped dragon: free it with the blade, feed it, pet it, bond, ride
  await S(() => { const s = window.__scene, d = s.dragons.find((x) => x.rec.trapped); window.__t = d; if (!d.ready) d.build(); const b = s.player.body; b.x = d.body.x - 30; b.y = d.body.y; b.vx = b.vy = 0; s.player.facing = 1; });
  await sleep(700); await page.screenshot({ path: join(SHOTS, '06-trapped.png') });
  await page.keyboard.press('KeyJ'); await sleep(600);
  check('cutting the net frees the trapped dragon', await S(() => !window.__t.rec.trapped && window.__t.rec.trust > 10), `confiança=${await S(() => Math.round(window.__t.rec.trust))}`);
  // offer food by holding the item key (real interaction path)
  await S(() => { const st = window.__state, ph = window.__t.ph; st.save.player.items[ph.favoriteFood] = 6; st.save.player.selected = ph.favoriteFood; window.__t.rec.fear = 5; window.__t.rec.hunger = 0.9; const b = window.__scene.player.body; b.x = window.__t.body.x - 60; });
  await page.keyboard.down('KeyF');
  const fed = await waitFor(page, () => window.__t.rec.memories.some((m) => m.kind === 'fed' || m.kind === 'healed'), 12000);
  await page.keyboard.up('KeyF');
  check('dragon walks up and eats food offered from the hand', fed, `confiança=${await S(() => Math.round(window.__t.rec.trust))}`);
  await page.screenshot({ path: join(SHOTS, '07-feeding.png') });
  // speed up the slow part of taming (time), keep the real ritual
  await S(() => { const r = window.__t.rec; r.trust = 90; r.fear = 0; r.injured = false; r.hp = window.__t.ph.stats.maxHp; r.observed = 0.9; const b = window.__scene.player.body; b.x = window.__t.body.x - 40; b.vx = 0; });
  check('trusting dragon starts the bonding ritual', await waitFor(page, () => window.__t.intent?.state === 'bonding', 10000));
  await page.keyboard.down('KeyE');
  const bonded = await waitFor(page, () => window.__t.rec.bonded, 9000);
  await page.keyboard.up('KeyE');
  check('holding still completes the bond', bonded);
  await sleep(400); await page.screenshot({ path: join(SHOTS, '08-bonded.png') });
  await page.keyboard.press('KeyE'); await sleep(300); // dismiss dialog
  // companion follows
  await page.keyboard.down('KeyA'); await sleep(2200); await page.keyboard.up('KeyA'); await sleep(1500);
  const fol = await S(() => ({ d: Math.abs(window.__t.body.x - window.__scene.player.body.x), st: window.__t.intent?.state }));
  check('bonded dragon follows the player', fol.d < 150, `dist=${Math.round(fol.d)} (${fol.st})`);

  // mount + flight
  await S(() => { const s = window.__scene, b = s.player.body; b.x = window.__t.body.x - 12; b.y = window.__t.body.y; window.__t.rec.training = 80; });
  await sleep(200);
  for (let i = 0; i < 6 && !(await S(() => !!window.__scene.mount)); i++) { await page.keyboard.press('KeyR'); await sleep(350); }
  check('player mounts the bonded dragon', await S(() => !!window.__scene.mount && window.__scene.player.state === 'riding'));
  const y0 = await S(() => window.__t.body.y);
  await page.keyboard.press('Space'); await sleep(250);
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await sleep(330); }
  const fl = await S(() => ({ y: window.__t.body.y, air: window.__t.air, vx: window.__t.body.vx, st: window.__t.flight.stamina }));
  check('takes off and climbs', fl.air && fl.y < y0 - 40, `subiu ${Math.round(y0 - fl.y)}px, vx=${Math.round(fl.vx)}`);
  await page.screenshot({ path: join(SHOTS, '09-flight.png') });
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await sleep(1300);
  const dive = await S(() => window.__t.body.vy);
  await page.keyboard.up('KeyS'); await page.keyboard.press('KeyI'); await sleep(200);
  check('diving builds downward speed', dive > 60, `vy=${Math.round(dive)}`);
  check('dragon breath fires a projectile', await S(() => window.__scene.shots.list.length > 0));
  await page.screenshot({ path: join(SHOTS, '10-dive-breath.png') });
  await page.keyboard.up('KeyD');

  // save / load round trip
  await S(() => window.__scene.saveNow());
  await sleep(500);
  const saved = await S(async () => { const req = indexedDB.open('dragonbound'); const db = await new Promise((r) => { req.onsuccess = () => r(req.result); }); const tx = db.transaction('saves').objectStore('saves').get('slot1'); const json = await new Promise((r) => { tx.onsuccess = () => r(tx.result); }); const s = JSON.parse(json); return { n: Object.keys(s.dragons).length, bonded: Object.values(s.dragons).filter((d) => d.bonded).length, v: s.version, comp: s.companion }; });
  check('save is written to IndexedDB with dragons, DNA and bond', saved.n >= 7 && saved.bonded === 1 && !!saved.comp, JSON.stringify(saved));

  // fly off the island edge → ocean, in flight
  await S(() => { const d = window.__t; d.air = true; d.body.y = (window.__scene.island.seaRow - 16) * 16; d.body.x = 60; d.body.vx = -150; d.facing = -1; });
  await page.keyboard.down('KeyA');
  check('flying past the shore opens the ocean scene', await waitFor(page, () => window.__game.scene.isActive('Ocean') && window.__ocean?.flying, 9000));
  await sleep(1800); await page.keyboard.up('KeyA'); await page.screenshot({ path: join(SHOTS, '11-ocean-flight.png') });
  // land back, then sail by boat
  await page.keyboard.down('KeyD');
  await waitFor(page, () => !!window.__ocean?.near, 12000);
  await page.keyboard.up('KeyD'); await page.keyboard.press('KeyE');
  check('landing prompt returns to the island', await waitFor(page, () => window.__game.scene.isActive('Island') && window.__scene?.player, 9000));
  await sleep(1200);
  await S(() => { const s = window.__scene; if (s.mount) s.doDismount(); s.sail(); });
  check('boat departs from the dock', await waitFor(page, () => window.__game.scene.isActive('Ocean') && window.__ocean && !window.__ocean.flying, 9000));
  await sleep(700);
  const o0 = await S(() => ({ x: window.__ocean.x, y: window.__ocean.y }));
  await page.keyboard.down('KeyA'); await page.keyboard.down('KeyS'); await sleep(3500);
  const o1 = await S(() => ({ x: window.__ocean.x, y: window.__ocean.y, sp: window.__ocean.speed }));
  check('boat sails under player control', Math.hypot(o1.x - o0.x, o1.y - o0.y) > 60, `andou ${Math.round(Math.hypot(o1.x - o0.x, o1.y - o0.y))}px`);
  await page.screenshot({ path: join(SHOTS, '12-ocean-boat.png') });
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyS');
  // sail to the volcano (teleport near, then real approach + disembark)
  await S(() => { const o = window.__ocean, s = o.sites.find((x) => x.id === 'brasaviva'); o.x = s.x - s.r * 1.25 - 90; o.y = s.y + 10; o.a = 0; });
  await page.keyboard.down('KeyD');
  const nearV = await waitFor(page, () => window.__ocean.near?.id === 'brasaviva', 15000);
  await page.keyboard.up('KeyD'); await page.screenshot({ path: join(SHOTS, '13-volcano-approach.png') });
  await page.keyboard.press('KeyE');
  check('reaches and disembarks on a second island', nearV && await waitFor(page, () => window.__game.scene.isActive('Island') && window.__scene?.island.id === 'brasaviva', 9000));
  await sleep(2000); await page.screenshot({ path: join(SHOTS, '14-volcanic-island.png') });
  check('new island has its own dragon population', await S(() => window.__scene.dragons.filter((d) => d.rec.genes.species === 'cinzal').length >= 2));

  // menu + remap
  await page.keyboard.press('Escape'); await sleep(300);
  check('pause menu opens', await S(() => window.__game.scene.getScene('UI').menu.open));
  await S(() => window.__game.scene.getScene('UI').menu.show('dragons')); await sleep(300); await page.screenshot({ path: join(SHOTS, '15-menu-dragons.png') });
  await S(() => window.__game.scene.getScene('UI').menu.show('map')); await sleep(300); await page.screenshot({ path: join(SHOTS, '16-menu-map.png') });
  await S(() => { const m = window.__game.scene.getScene('UI').menu; m.show('controls'); m.idx = 4; m.draw(); }); await sleep(200);
  await page.keyboard.press('Space'); await sleep(200); await page.keyboard.press('KeyP'); await sleep(300);
  check('remapping a key updates the binding', await S(() => window.__input.bindings.keys.jump[0] === 'KeyP'));
  await page.screenshot({ path: join(SHOTS, '17-menu-controls.png') });
  await page.keyboard.press('Escape'); await sleep(300);
  const yb = (await pos()).y; await page.keyboard.press('KeyP'); await sleep(200);
  check('the remapped key actually jumps', (await pos()).y < yb - 8);
  await S(() => window.__input.resetDefaults());

  // storm island visual
  await S(() => window.__scene.scene.start('Island', { islandId: 'trovao', entry: 'dock' }));
  await waitFor(page, () => window.__scene?.island.id === 'trovao'); await sleep(2500);
  await S(() => { const b = window.__scene.player.body; b.x = 118 * 16; b.y = (80 - 43) * 16; }); await sleep(1500);
  await page.screenshot({ path: join(SHOTS, '18-storm-island.png') });
  // procedural islet
  const islet = await S(() => window.__state.save.worldSeed);
  await S(() => window.__scene.sail()); await waitFor(page, () => window.__game.scene.isActive('Ocean') && window.__ocean, 9000); await sleep(500);
  const isl = await S(() => { const o = window.__ocean, s = o.sites.find((x) => !x.main); o.x = s.x - s.r * 1.25 - 30; o.y = s.y + 6; return s.id; });
  await sleep(600); await page.screenshot({ path: join(SHOTS, '19-islet-sea.png') });
  await waitFor(page, () => !!window.__ocean.near, 5000); await page.keyboard.press('KeyE');
  check('procedural islet is generated and explorable', await waitFor(page, (id) => window.__scene?.island.id === id && window.__scene.player.body.onGround, 9000, isl), `${isl} seed ${islet}`);
  await sleep(1500); await page.screenshot({ path: join(SHOTS, '20-procedural-islet.png') });
  const perf = await S(() => ({ fps: Math.round(window.__game.loop.actualFps), ent: window.__scene.dragons.length + window.__scene.enemies.length }));
  results.push(`INFO  headless software-GL frame rate: ${perf.fps} fps with ${perf.ent} entities (not representative of real devices)`);
  await ctx.close();

  // ── mobile: touch controls + service worker ──────────────────────────
  const mctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const m = await mctx.newPage();
  m.on('pageerror', (e) => errors.push('mobile: ' + String(e.stack ?? e).slice(0, 300)));
  await m.goto(URL);
  await waitFor(m, () => window.__game?.scene.isActive('Title')); await sleep(500);
  await m.evaluate(() => { window.__state.newGame(7); window.__game.scene.getScene('Title').scene.start('Island', { islandId: 'alvamar', entry: 'load' }); });
  await waitFor(m, () => window.__scene?.player); await sleep(1200);
  const size = await m.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
  // tap once so the overlay appears, then drive stick + jump simultaneously (multitouch)
  const toPage = (gx, gy) => m.evaluate(([x, y]) => { const c = window.__game.canvas.getBoundingClientRect(); return [c.left + (x / window.__game.scale.width) * c.width, c.top + (y / window.__game.scale.height) * c.height]; }, [gx, gy]);
  const cdp = await mctx.newCDPSession(m);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const mid = await toPage(size.w / 2, 60);
  await touch('touchStart', [mid]); await touch('touchEnd', []); await sleep(400);
  check('touch overlay appears after the first touch', await m.evaluate(() => window.__game.scene.getScene('UI').touch.visible));
  const mx0 = await m.evaluate(() => window.__scene.player.body.x);
  const stick = await toPage(56, size.h - 54), stickR = await toPage(56 + 22, size.h - 54), jump = await toPage(size.w - 60, size.h - 28);
  await touch('touchStart', [stick]); await touch('touchMove', [stickR]); await sleep(700);
  await touch('touchMove', [stickR, jump]); await sleep(60); await touch('touchStart', [stickR, jump]); await sleep(200);
  const mj = await m.evaluate(() => ({ x: window.__scene.player.body.x, y: window.__scene.player.body.y, g: window.__scene.player.body.onGround, ax: window.__input.axisX }));
  await m.screenshot({ path: join(SHOTS, '21-mobile-touch.png') });
  await touch('touchEnd', []); await sleep(300);
  check('virtual stick moves the player', mj.x > mx0 + 30, `dx=${Math.round(mj.x - mx0)} axis=${mj.ax.toFixed(2)}`);
  check('second finger jumps while the first holds the stick (multitouch)', !mj.g);
  check('stick releases cleanly', await m.evaluate(() => Math.abs(window.__input.axisX) < 0.01));
  const sw = await waitFor(m, async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r && !!(r.active || r.installing || r.waiting); }, 10000);
  check('service worker registers', sw);
  const man = await m.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return null; const j = await (await fetch(l.href)).json(); return { name: j.name, display: j.display, orientation: j.orientation, icons: j.icons.length }; });
  check('web manifest is installable (name, icons, landscape)', !!man && man.icons >= 2 && man.orientation === 'landscape', JSON.stringify(man));
  await sleep(1500);
  const cached = await m.evaluate(async () => { const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return n; });
  check('assets are precached for offline play', cached > 60, `${cached} arquivos`);
  await mctx.setOffline(true); await m.reload(); 
  check('game boots offline from the cache', await waitFor(m, () => window.__game?.scene.isActive('Title'), 12000));
  await mctx.close();

  await browser.close();
  check('no uncaught errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));
}

main().catch((e) => { check('e2e harness ran to completion', false, String(e.stack ?? e).slice(0, 500)); }).finally(() => {
  server.kill();
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
