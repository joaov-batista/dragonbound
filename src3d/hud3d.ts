import '@fontsource/jersey-10';
import * as THREE from 'three';
import type { HeroStyle } from '../src/art/hero';
import { input, type Act } from './input';

/**
 * DOM HUD, inset by the phone's safe area: hearts + stamina, a compass with the objective marker,
 * one objective line, the focused dragon, a prompt, toasts, touch buttons, and the menus
 * (quest log, bag, shop, character creator).
 */
export class Hud {
  private el: Record<string, HTMLElement> = {};
  private toastT = 0; private panel: HTMLElement | null = null;
  constructor(private root: HTMLElement) {
    const css = document.createElement('style');
    css.textContent = `
      #hud{inset:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)!important;margin:max(1.5vh,8px) max(2vw,10px)}
      #hud .bars{position:absolute;left:0;top:0}
      #hud .bar{width:150px;height:9px;background:#1d2238;border:2px solid #0c0e1a;margin-bottom:3px}
      #hud .bar i{display:block;height:100%}
      #hud .obj{position:absolute;left:0;top:44px;font-size:20px;max-width:46vw;color:#f2c14e}
      #hud .obj small{display:block;color:#d8dcef;font-size:17px}
      #hud .compass{position:absolute;left:50%;top:0;width:min(420px,52vw);height:26px;transform:translateX(-50%);overflow:hidden;background:linear-gradient(90deg,transparent,rgba(12,14,26,.55) 18%,rgba(12,14,26,.55) 82%,transparent);font-size:18px}
      #hud .compass span{position:absolute;top:2px;transform:translateX(-50%)}
      #hud .compass .q{color:#f2c14e}
      #hud .marker{position:absolute;transform:translate(-50%,-100%);text-align:center;color:#f2c14e;font-size:18px;display:none}
      #hud .marker b{display:block;font-size:26px;line-height:22px}
      #hud .cross{position:absolute;left:50%;top:46%;width:18px;height:18px;margin:-9px;border:2px solid rgba(255,255,255,.75);border-radius:50%;display:none}
      #hud .prompt{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);font-size:22px;padding:4px 14px;background:rgba(12,14,26,.6);border-radius:6px;white-space:nowrap;display:none}
      #hud .dragon{position:absolute;right:0;top:0;text-align:right;font-size:20px;display:none}
      #hud .dragon .bar{margin-left:auto}
      #hud .lives{font-size:18px;color:#ff6a6a;letter-spacing:2px}
      #hud .ring{position:absolute;left:50%;bottom:14%;width:46px;height:46px;margin-left:-23px;border-radius:50%;display:none}
      #hud .toast{position:absolute;left:50%;top:18%;transform:translateX(-50%);font-size:24px;color:#f4f0e6;text-align:center;max-width:70vw;opacity:0;transition:opacity .3s;background:rgba(12,14,26,.55);padding:4px 12px;border-radius:6px}
      #hud .float{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,10,22,.6);pointer-events:auto}
      #hud .card{background:#141a30;border:2px solid #f2c14e;border-radius:10px;padding:16px 22px;max-width:min(560px,86vw);max-height:80vh;overflow:auto;font-size:20px}
      #hud .card h3{margin:0 0 8px;color:#f2c14e;font-size:28px;font-weight:normal}
      #hud .card .row{display:flex;justify-content:space-between;gap:16px;padding:3px 0;border-bottom:1px solid #252c48}
      #hud .card button,#hud .title button{font:inherit;font-size:19px;background:#2a3358;color:#f4f0e6;border:1px solid #4a5a86;border-radius:6px;padding:3px 10px;cursor:pointer}
      #hud .card button.on{background:#b8552e;border-color:#f2c14e}
      #hud .card .done{color:#7a86a8;text-decoration:line-through}
      #hud .title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,10,22,.55);pointer-events:auto;text-align:center}
      #hud .title h1{font-size:clamp(44px,9vw,76px);margin:0;letter-spacing:3px}
      #hud .title h2{font-size:24px;margin:4px 0 20px;color:#f2c14e;font-weight:normal}
      #hud .title .go{margin-top:14px;font-size:30px;padding:8px 26px;background:#b8552e;border-radius:8px;color:#fff;cursor:pointer}
      #hud .tbtn{position:absolute;width:62px;height:62px;border-radius:50%;background:rgba(20,24,44,.55);border:2px solid rgba(255,255,255,.4);display:none;align-items:center;justify-content:center;font-size:17px;pointer-events:auto}
      #hud.touch .tbtn{display:flex}
      #hud .tsmall{width:46px;height:46px;font-size:14px}
      #hud .stick{position:fixed;width:110px;height:110px;margin:-55px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:none}
      #hud .creator{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;align-items:center}
      #hud .creator canvas{image-rendering:pixelated;grid-row:span 12;width:144px;height:144px;background:#0c0e1a;border-radius:8px}
      #hud .sw{display:inline-block;width:22px;height:22px;border-radius:4px;border:2px solid #0c0e1a;margin:1px;cursor:pointer}
      #hud .sw.on{border-color:#f2c14e}
    `;
    document.head.appendChild(css);
    const mk = (cls: string, html = ''): HTMLElement => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); this.el[cls] = d; return d; };
    mk('bars', '<div class="bar hp"><i style="background:#ff5a5a"></i></div><div class="bar st"><i style="background:#7fe0a0"></i></div><div class="bar mt" style="display:none"><i style="background:#7fe8d0"></i></div>');
    mk('obj'); mk('compass'); mk('marker', '<b>◆</b><span></span>'); mk('cross'); mk('prompt');
    mk('dragon', '<span class="n"></span><div class="bar"><i style="background:#7fe8d0"></i></div><div class="lives"></div>');
    mk('ring'); mk('toast'); mk('stick');
    const btns: [Act, string, number, number, boolean][] = [['jump', 'Pular', 92, 104, false], ['interact', 'E', 168, 138, false], ['food', 'Comida', 168, 56, false], ['mount', 'Montar', 244, 104, false], ['shoot', 'Atacar', 92, 188, false], ['dash', 'Rolar', 16, 138, false], ['block', 'Defesa', 16, 56, false], ['up', '▲', 244, 188, true], ['down', '▼', 244, 250, true], ['map', 'Missões', 16, 250, true], ['bag', 'Bolsa', 92, 270, true]];
    for (const [a, label, r, b, small] of btns) { const d = document.createElement('div'); d.className = 'tbtn' + (small ? ' tsmall' : ''); d.textContent = label; d.style.right = r + 'px'; d.style.bottom = b + 'px'; root.appendChild(d); input.bindButton(d, a); }
  }
  get menuOpen(): boolean { return !!this.panel; }

  title(onStart: () => void, onCreator: () => void): void {
    const t = document.createElement('div'); t.className = 'title';
    t.innerHTML = `<h1>DRAGONBOUND</h1><h2>Uma vida entre dragões · mundo aberto (protótipo)</h2><div class="go">Jogar</div><p style="margin-top:14px"><button class="cr">Personagem</button></p>`;
    (t.querySelector('.go') as HTMLElement).onclick = () => { t.remove(); onStart(); };
    (t.querySelector('.cr') as HTMLElement).onclick = (e) => { e.stopPropagation(); onCreator(); };
    this.root.appendChild(t);
  }
  /** Character creator: options as swatches/buttons, live preview drawn by `preview`. */
  creator(style: HeroStyle, preview: (st: HeroStyle, c: HTMLCanvasElement) => void, done: (st: HeroStyle) => void): void {
    const st: HeroStyle = { ...style };
    const opts: { key: keyof HeroStyle; label: string; vals: (number | string | null)[]; color: boolean }[] = [
      { key: 'skin', label: 'Pele', vals: [0xf0c8a0, 0xd9955f, 0xb87a4a, 0x8a5a3a, 0x5a3a28], color: true },
      { key: 'hairStyle', label: 'Cabelo', vals: ['tuft', 'long', 'braid', 'bun', 'bald'], color: false },
      { key: 'hair', label: 'Cor do cabelo', vals: [0x33283f, 0x5a3a24, 0x8a5a30, 0xd8b060, 0xc04a2a, 0xe8e8e8, 0x1a1a1a], color: true },
      { key: 'beard', label: 'Barba', vals: ['none', 'short', 'long'], color: false },
      { key: 'tunic', label: 'Túnica', vals: [0x3f55a0, 0x8a2a3a, 0x4f8a4a, 0x6a4a9a, 0xc8a060, 0x2a3448, 0x7c4a2e], color: true },
      { key: 'pants', label: 'Calça', vals: [0xc8b086, 0x5a4a3a, 0x3a4a6a, 0x8a8a8a], color: true },
      { key: 'scarf', label: 'Lenço', vals: [0xe4533c, 0xf2c14e, 0x3fa0c8, 0x8fe07a, 0xffffff, null], color: true },
      { key: 'hat', label: 'Cabeça', vals: ['none', 'hood', 'cap'], color: false },
    ];
    const NAMES: Record<string, string> = { tuft: 'Topete', long: 'Longo', braid: 'Trança', bun: 'Coque', bald: 'Careca', none: 'Nenhum', short: 'Curta', hood: 'Capuz', cap: 'Gorro' };
    const f = this.open('<h3>Seu personagem</h3><div class="creator"><canvas width="48" height="48"></canvas></div><p style="text-align:right;margin:10px 0 0"><button class="ok on">Pronto</button></p>');
    const grid = f.querySelector('.creator') as HTMLElement, cv = f.querySelector('canvas') as HTMLCanvasElement;
    const redraw = (): void => {
      preview(st, cv);
      grid.querySelectorAll('.opt').forEach((n) => n.remove());
      for (const o of opts) {
        const lab = document.createElement('div'); lab.className = 'opt'; lab.textContent = o.label; grid.appendChild(lab);
        const row = document.createElement('div'); row.className = 'opt'; grid.appendChild(row);
        for (const v of o.vals) {
          const on = st[o.key] === v;
          const b = document.createElement(o.color ? 'span' : 'button'); b.className = (o.color ? 'sw' : '') + (on ? ' on' : '');
          if (o.color) b.style.background = v === null ? 'repeating-linear-gradient(45deg,#333,#333 4px,#555 4px,#555 8px)' : '#' + (v as number).toString(16).padStart(6, '0');
          else b.textContent = NAMES[v as string] ?? String(v);
          b.onclick = () => { (st as unknown as Record<string, unknown>)[o.key] = v; redraw(); };
          row.appendChild(b);
        }
      }
    };
    redraw();
    (f.querySelector('.ok') as HTMLElement).onclick = () => { this.close(); done(st); };
  }
  /** A modal card; returns its element. Closes on the next call to close(). */
  open(html: string): HTMLElement {
    this.close();
    const w = document.createElement('div'); w.className = 'float'; w.innerHTML = `<div class="card">${html}</div>`;
    w.addEventListener('click', (e) => { if (e.target === w) this.close(); });
    this.root.appendChild(w); this.panel = w; document.exitPointerLock?.();
    return w;
  }
  close(): void { this.panel?.remove(); this.panel = null; }

  bars(hp: number, st: number, mount: number | null): void {
    const b = this.el.bars;
    ((b.querySelector('.hp') as HTMLElement).firstChild as HTMLElement).style.width = Math.max(0, hp * 100) + '%';
    ((b.querySelector('.st') as HTMLElement).firstChild as HTMLElement).style.width = Math.max(0, st * 100) + '%';
    const m = b.querySelector('.mt') as HTMLElement; m.style.display = mount === null ? 'none' : 'block'; if (mount !== null) (m.firstChild as HTMLElement).style.width = Math.max(0, mount * 100) + '%';
  }
  objective(text: string | null, sub = ''): void { const o = this.el.obj; o.innerHTML = text ? `◆ ${text}${sub ? `<small>${sub}</small>` : ''}` : ''; }
  /** Compass strip: cardinal letters by camera yaw, plus the objective's bearing. */
  compass(yaw: number, target: { bearing: number } | null): void {
    const w = this.el.compass.clientWidth || 360, html: string[] = [];
    const place = (bearing: number, label: string, cls = ''): void => { let d = bearing - yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.abs(d) > 1.3) return; html.push(`<span class="${cls}" style="left:${(0.5 - d / 2.6) * w}px">${label}</span>`); };
    // yaw 0 looks toward +z (south on our map)
    place(Math.PI, 'N'); place(0, 'S'); place(Math.PI / 2, 'L'); place(-Math.PI / 2, 'O');
    for (const a of [Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75]) place(a, '·');
    if (target) place(target.bearing, '◆', 'q');
    this.el.compass.innerHTML = html.join('');
  }
  /** Objective marker floating over its target on screen. */
  marker(cam: THREE.Camera, pos: THREE.Vector3 | null, meters: number): void {
    const m = this.el.marker; if (!pos) { m.style.display = 'none'; return; }
    const v = pos.clone().project(cam); if (v.z > 1) { m.style.display = 'none'; return; }
    const r = this.root.getBoundingClientRect();
    m.style.display = 'block'; m.style.left = Math.max(20, Math.min(r.width - 20, (v.x * 0.5 + 0.5) * r.width)) + 'px'; m.style.top = Math.max(60, Math.min(r.height - 30, (-v.y * 0.5 + 0.5) * r.height)) + 'px';
    (m.querySelector('span') as HTMLElement).textContent = meters > 8 ? `${Math.round(meters)} m` : '';
  }
  crosshair(on: boolean): void { this.el.cross.style.display = on ? 'block' : 'none'; }
  prompt(text: string | null): void { const p = this.el.prompt; p.style.display = text ? 'block' : 'none'; if (text) p.textContent = text; }
  dragon(name: string | null, bar = 0, color = '#7fe8d0', lives = -1): void {
    const d = this.el.dragon; d.style.display = name ? 'block' : 'none'; if (!name) return;
    (d.querySelector('.n') as HTMLElement).textContent = name; const i = d.querySelector('i') as HTMLElement; i.style.width = Math.round(bar * 100) + '%'; i.style.background = color;
    (d.querySelector('.lives') as HTMLElement).textContent = lives >= 0 ? '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 3 - lives)) : '';
  }
  ring(k: number): void { const r = this.el.ring; r.style.display = k > 0.01 ? 'block' : 'none'; r.style.background = `conic-gradient(#7fe8d0 ${k * 360}deg, rgba(20,24,44,.6) 0)`; }
  toast(text: string): void { const t = this.el.toast; t.textContent = text; t.style.opacity = '1'; this.toastT = Math.min(5, 2.2 + text.length * 0.04); }
  update(dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.style.opacity = '0';
    const s = input.stickPos, st = this.el.stick;
    st.style.display = s ? 'block' : 'none'; if (s) { st.style.left = s.x + 'px'; st.style.top = s.y + 'px'; }
  }
}
