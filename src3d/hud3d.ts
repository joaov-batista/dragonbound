import '@fontsource/jersey-10';
import { input, type Act } from './input';

/** Minimal DOM HUD: hearts, stamina, crosshair, one prompt line, the focused dragon's trust, toasts, touch buttons. */
export class Hud {
  private el: Record<string, HTMLElement> = {};
  private toastT = 0;
  constructor(private root: HTMLElement) {
    const css = document.createElement('style');
    css.textContent = `
      #hud .hearts{position:absolute;left:14px;top:12px;font-size:26px;letter-spacing:2px;color:#ff5a5a}
      #hud .stam{position:absolute;left:14px;top:44px;width:130px;height:8px;background:#1d2238;border:2px solid #0c0e1a;display:none}
      #hud .stam i{display:block;height:100%;background:#7fe0a0}
      #hud .cross{position:absolute;left:50%;top:46%;width:18px;height:18px;margin:-9px;border:2px solid rgba(255,255,255,.75);border-radius:50%;display:none}
      #hud .prompt{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);font-size:24px;padding:4px 14px;background:rgba(12,14,26,.55);border-radius:6px;white-space:nowrap;display:none}
      #hud .dragon{position:absolute;left:50%;top:12px;transform:translateX(-50%);text-align:center;font-size:22px;display:none}
      #hud .dragon .bar{width:160px;height:7px;background:#1d2238;margin:3px auto 0;border:2px solid #0c0e1a}
      #hud .dragon .bar i{display:block;height:100%;background:#7fe8d0}
      #hud .ring{position:absolute;left:50%;bottom:16%;width:46px;height:46px;margin-left:-23px;border-radius:50%;display:none}
      #hud .toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:26px;color:#f2c14e;text-align:center;max-width:80vw;opacity:0;transition:opacity .3s}
      #hud .title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,10,22,.55);pointer-events:auto;cursor:pointer;text-align:center}
      #hud .title h1{font-size:72px;margin:0;color:#f4f0e6;letter-spacing:3px}
      #hud .title h2{font-size:26px;margin:4px 0 22px;color:#f2c14e;font-weight:normal}
      #hud .title p{font-size:21px;margin:3px;color:#d8dcef}
      #hud .title .go{margin-top:22px;font-size:30px;padding:8px 26px;background:#b8552e;border-radius:8px;color:#fff}
      #hud .tbtn{position:absolute;width:64px;height:64px;border-radius:50%;background:rgba(20,24,44,.55);border:2px solid rgba(255,255,255,.4);display:none;align-items:center;justify-content:center;font-size:18px;pointer-events:auto}
      #hud.touch .tbtn{display:flex}
      #hud .stick{position:absolute;width:110px;height:110px;margin:-55px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:none}
    `;
    document.head.appendChild(css);
    const mk = (cls: string, html = ''): HTMLElement => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); this.el[cls] = d; return d; };
    mk('hearts'); mk('stam', '<i></i>'); mk('cross'); mk('prompt'); mk('dragon', '<span class="n"></span><div class="bar"><i></i></div>'); mk('ring'); mk('toast'); mk('stick');
    const btns: [Act, string, number, number][] = [['jump', 'Pular', 96, 120], ['interact', 'E', 176, 150], ['food', 'Comida', 176, 62], ['mount', 'Montar', 256, 120], ['shoot', 'Tiro', 96, 210], ['dash', 'Dash', 22, 150], ['melee', 'Golpe', 22, 62]];
    for (const [a, label, r, b] of btns) { const d = document.createElement('div'); d.className = 'tbtn'; d.textContent = label; d.style.right = r + 'px'; d.style.bottom = b + 'px'; root.appendChild(d); input.bindButton(d, a); }
  }
  title(onStart: () => void): void {
    const t = document.createElement('div'); t.className = 'title';
    t.innerHTML = `<h1>DRAGONBOUND</h1><h2>Mundo aberto · protótipo 3D</h2>
      <p>WASD andar · mouse olhar · Shift andar devagar · Espaço pular / bater asas</p>
      <p>Segure F oferecer comida · E carinho (segure para o vínculo) · R montar</p>
      <p>Voando: W/S velocidade · Q subir · C descer · K dash · clique ou I tiro (segure: bola de poder) · J golpe</p>
      <div class="go">Clique para jogar</div>`;
    const go = (): void => { t.remove(); onStart(); };
    t.addEventListener('click', go); t.addEventListener('touchend', (e) => { e.preventDefault(); go(); });
    this.root.appendChild(t);
  }
  hearts(hp: number, max: number): void { this.el.hearts.textContent = '♥'.repeat(Math.max(0, hp)) + '♡'.repeat(Math.max(0, max - hp)); }
  stamina(k: number | null): void { const s = this.el.stam; s.style.display = k === null ? 'none' : 'block'; if (k !== null) (s.firstChild as HTMLElement).style.width = Math.round(k * 100) + '%'; }
  crosshair(on: boolean): void { this.el.cross.style.display = on ? 'block' : 'none'; }
  prompt(text: string | null): void { const p = this.el.prompt; p.style.display = text ? 'block' : 'none'; if (text) p.textContent = text; }
  dragon(name: string | null, trust = 0, color = '#7fe8d0'): void {
    const d = this.el.dragon; d.style.display = name ? 'block' : 'none'; if (!name) return;
    (d.querySelector('.n') as HTMLElement).textContent = name; const i = d.querySelector('i') as HTMLElement; i.style.width = Math.round(trust) + '%'; i.style.background = color;
  }
  ring(k: number): void { const r = this.el.ring; r.style.display = k > 0.01 ? 'block' : 'none'; r.style.background = `conic-gradient(#7fe8d0 ${k * 360}deg, rgba(20,24,44,.6) 0)`; }
  toast(text: string): void { const t = this.el.toast; t.textContent = text; t.style.opacity = '1'; this.toastT = 3.2; }
  update(dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.style.opacity = '0';
    const s = input.stickPos, st = this.el.stick;
    st.style.display = s ? 'block' : 'none'; if (s) { st.style.left = s.x + 'px'; st.style.top = s.y + 'px'; }
  }
}
