import { settings } from '../core/settings';
import { events } from '../core/events';

type Bus = 'sfx' | 'music' | 'ambience' | 'voices';
export type AmbienceId = 'waves' | 'wind' | 'rain' | 'cave' | 'lava' | 'birds' | 'night';
export type Sfx = 'step' | 'jump' | 'land' | 'dash' | 'slash' | 'hit' | 'crit' | 'parry' | 'hurt' | 'pickup' | 'ui' | 'uiBack' | 'bond' | 'whistle' | 'splash' | 'flap' | 'fire' | 'ice' | 'zap' | 'water' | 'thunder' | 'eat' | 'chest' | 'death' | 'quake' | 'spore' | 'creak' | 'deny';
export interface VoiceProfile { pitch: number; rough: number; size: number }

/**
 * Fully synthesised audio (Web Audio API): no sample files to ship, cache or license.
 * Separate buses for music, effects, ambience and creature voices.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus = {} as Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private amb = new Map<AmbienceId, { gain: GainNode; target: number }>();
  private musicTimer = 0; private musicMood: 'calm' | 'tense' | 'storm' | 'ocean' | 'none' = 'none'; private step = 0;
  private windGain: GainNode | null = null;

  /** Must be called from a user gesture (autoplay policies). Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    for (const b of ['sfx', 'music', 'ambience', 'voices'] as Bus[]) { this.bus[b] = ctx.createGain(); this.bus[b].connect(this.master); }
    const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3.5 * 0.5; }
    this.applyVolumes();
    events.on('settingsChanged', () => this.applyVolumes());
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) void this.ctx.suspend(); else void this.ctx.resume(); });
  }
  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = settings.master; this.bus.sfx.gain.value = settings.sfx; this.bus.music.gain.value = settings.music * 0.6;
    this.bus.ambience.gain.value = settings.ambience; this.bus.voices.gain.value = settings.voices;
  }
  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  private tone(bus: Bus, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.005): void {
    const c = this.ctx!; const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bus[bus]); o.start(t); o.stop(t + dur + 0.02);
  }
  private burst(bus: Bus, dur: number, vol: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const c = this.ctx!; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus[bus]); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  play(id: Sfx, vol = 1): void {
    if (!this.ready) return;
    const v = vol;
    switch (id) {
      case 'step': this.burst('sfx', 0.06, 0.12 * v, 900 + Math.random() * 500, 300, 1.2); break;
      case 'jump': this.tone('sfx', 'square', 300, 620, 0.12, 0.07 * v); break;
      case 'land': this.burst('sfx', 0.12, 0.28 * v, 500, 90, 0.8, 'lowpass'); break;
      case 'dash': this.burst('sfx', 0.2, 0.3 * v, 2600, 500, 1.5); break;
      case 'slash': this.burst('sfx', 0.13, 0.32 * v, 5200, 1200, 2.2); this.tone('sfx', 'sawtooth', 900, 240, 0.09, 0.04 * v); break;
      case 'hit': this.burst('sfx', 0.1, 0.5 * v, 1400, 200, 0.9, 'lowpass'); this.tone('sfx', 'square', 190, 70, 0.1, 0.16 * v); break;
      case 'crit': this.play('hit', v); this.tone('sfx', 'square', 1300, 2400, 0.14, 0.07 * v, 0.02); break;
      case 'parry': this.tone('sfx', 'triangle', 2100, 1700, 0.3, 0.22 * v); this.tone('sfx', 'square', 3150, 2900, 0.18, 0.05 * v); this.burst('sfx', 0.05, 0.3 * v, 6000, 3000, 2); break;
      case 'hurt': this.tone('sfx', 'sawtooth', 420, 130, 0.25, 0.18 * v); this.burst('sfx', 0.12, 0.25 * v, 900, 200); break;
      case 'pickup': this.tone('sfx', 'square', 880, 880, 0.07, 0.07 * v); this.tone('sfx', 'square', 1320, 1320, 0.12, 0.07 * v, 0.07); break;
      case 'ui': this.tone('sfx', 'square', 660, 700, 0.05, 0.05 * v); break;
      case 'uiBack': this.tone('sfx', 'square', 440, 330, 0.07, 0.05 * v); break;
      case 'deny': this.tone('sfx', 'square', 200, 150, 0.14, 0.07 * v); break;
      case 'bond': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('sfx', 'triangle', f, f, 0.5, 0.14 * v, i * 0.11, 0.02)); break;
      case 'whistle': this.tone('sfx', 'sine', 1400, 2300, 0.16, 0.16 * v); this.tone('sfx', 'sine', 2300, 1700, 0.25, 0.16 * v, 0.17); break;
      case 'splash': this.burst('sfx', 0.4, 0.4 * v, 2400, 300, 0.7); break;
      case 'flap': this.burst('sfx', 0.2, 0.3 * v, 380, 110, 0.7, 'lowpass'); break;
      case 'fire': this.burst('sfx', 0.6, 0.45 * v, 700, 180, 0.5, 'lowpass'); this.burst('sfx', 0.4, 0.15 * v, 3000, 900, 1); break;
      case 'ice': this.burst('sfx', 0.45, 0.3 * v, 7000, 2500, 3); this.tone('sfx', 'triangle', 2600, 3400, 0.3, 0.05 * v); break;
      case 'zap': for (let i = 0; i < 4; i++) this.tone('sfx', 'sawtooth', 1800 - i * 300 + Math.random() * 500, 160, 0.07, 0.11 * v, i * 0.035); break;
      case 'water': this.burst('sfx', 0.5, 0.4 * v, 1800, 500, 0.8); break;
      case 'thunder': this.burst('sfx', 1.6, 0.9 * v, 320, 40, 0.4, 'lowpass'); this.burst('sfx', 0.2, 0.5 * v, 3000, 400, 0.6); break;
      case 'eat': for (let i = 0; i < 3; i++) this.burst('sfx', 0.07, 0.25 * v, 1100, 400, 1.5, 'bandpass', i * 0.16); break;
      case 'chest': this.tone('sfx', 'square', 392, 392, 0.1, 0.07 * v); this.tone('sfx', 'square', 587, 587, 0.1, 0.07 * v, 0.1); this.tone('sfx', 'square', 784, 784, 0.22, 0.07 * v, 0.2); break;
      case 'death': this.tone('sfx', 'sawtooth', 300, 40, 0.8, 0.2 * v); break;
      case 'quake': this.burst('sfx', 0.7, 0.8 * v, 160, 40, 0.5, 'lowpass'); break;
      case 'spore': this.burst('sfx', 0.5, 0.25 * v, 1500, 3200, 1); break;
      case 'creak': this.tone('sfx', 'sawtooth', 110, 90, 0.3, 0.05 * v); break;
    }
  }

  /** Dragon vocalisations, shaped by the individual (bigger = lower, rougher = more growl). */
  voice(kind: 'chirp' | 'growl' | 'roar' | 'purr' | 'whine', p: VoiceProfile, vol = 1): void {
    if (!this.ready) return;
    const c = this.ctx!, t = c.currentTime, base = (520 / (0.5 + p.size)) * (0.8 + p.pitch * 0.5);
    const o = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2600;
    let dur = 0.3, v = 0.14;
    o.type = 'sawtooth'; mod.type = 'square';
    if (kind === 'chirp') { o.type = 'triangle'; dur = 0.22; o.frequency.setValueAtTime(base * 1.6, t); o.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.08); o.frequency.exponentialRampToValueAtTime(base * 1.9, t + dur); mod.frequency.value = 28; mg.gain.value = base * 0.1 * p.rough; }
    else if (kind === 'growl') { dur = 0.7; v = 0.16; o.frequency.setValueAtTime(base * 0.34, t); o.frequency.linearRampToValueAtTime(base * 0.28, t + dur); mod.frequency.value = 26 + p.rough * 22; mg.gain.value = base * 0.2; f.frequency.value = 900; }
    else if (kind === 'roar') { dur = 1.0; v = 0.26; o.frequency.setValueAtTime(base * 0.5, t); o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.18); o.frequency.exponentialRampToValueAtTime(base * 0.3, t + dur); mod.frequency.value = 38 + p.rough * 30; mg.gain.value = base * 0.35; f.frequency.value = 1800; this.burst('voices', dur, 0.2 * vol, 1200, 300, 0.6); }
    else if (kind === 'purr') { o.type = 'triangle'; dur = 0.9; v = 0.1; o.frequency.value = base * 0.22; mod.frequency.value = 22; mg.gain.value = base * 0.12; f.frequency.value = 500; }
    else { o.type = 'triangle'; dur = 0.5; o.frequency.setValueAtTime(base * 2.1, t); o.frequency.exponentialRampToValueAtTime(base * 1.2, t + dur); mod.frequency.value = 9; mg.gain.value = base * 0.12; }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(mg); mg.connect(o.frequency); o.connect(f); f.connect(g); g.connect(this.bus.voices);
    o.start(t); mod.start(t); o.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  /** Set target levels (0..1) for looping ambience beds; unspecified beds fade out. */
  setAmbience(levels: Partial<Record<AmbienceId, number>>): void {
    if (!this.ctx) return;
    for (const id of ['waves', 'wind', 'rain', 'cave', 'lava', 'birds', 'night'] as AmbienceId[]) {
      const lv = levels[id] ?? 0; let a = this.amb.get(id);
      if (!a && lv > 0) { a = { gain: this.makeBed(id), target: 0 }; this.amb.set(id, a); }
      if (a) { a.target = lv; a.gain.gain.setTargetAtTime(lv, this.ctx.currentTime, 0.8); }
    }
  }
  private makeBed(id: AmbienceId): GainNode {
    const c = this.ctx!, g = c.createGain(); g.gain.value = 0; g.connect(this.bus.ambience);
    const src = (): AudioBufferSourceNode => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const lfo = (rate: number, depth: number, param: AudioParam): void => { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = rate; og.gain.value = depth; o.connect(og); og.connect(param); o.start(); };
    const f = c.createBiquadFilter(), pre = c.createGain(); pre.gain.value = 0.5;
    if (id === 'waves') { f.type = 'lowpass'; f.frequency.value = 650; lfo(0.11, 0.38, pre.gain); lfo(0.07, 250, f.frequency); }
    else if (id === 'wind') { f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 1.4; lfo(0.19, 260, f.frequency); lfo(0.13, 0.3, pre.gain); this.windGain = pre; }
    else if (id === 'rain') { f.type = 'highpass'; f.frequency.value = 2400; pre.gain.value = 0.32; }
    else if (id === 'cave') { f.type = 'lowpass'; f.frequency.value = 170; pre.gain.value = 0.9; lfo(0.05, 0.3, pre.gain); }
    else if (id === 'lava') { f.type = 'lowpass'; f.frequency.value = 240; pre.gain.value = 0.9; lfo(0.9, 0.3, pre.gain); lfo(0.23, 80, f.frequency); }
    else { f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 6; pre.gain.value = id === 'night' ? 0.12 : 0.0; if (id === 'night') lfo(11, 0.1, pre.gain); }
    src().connect(f); f.connect(pre); pre.connect(g);
    return g;
  }
  /** Extra wind loudness from flight speed (0..1). */
  setWindBoost(k: number): void { if (this.windGain && this.ctx) this.windGain.gain.setTargetAtTime(0.5 + k * 0.9, this.ctx.currentTime, 0.2); }

  setMusic(mood: 'calm' | 'tense' | 'storm' | 'ocean' | 'none'): void { this.musicMood = mood; }
  /** Generative score: sparse pentatonic plucks over a slow pad. Call every frame. */
  update(dt: number, daylight: number): void {
    if (!this.ready) return;
    // bird / cricket one-shots
    const birds = this.amb.get('birds'), night = this.amb.get('night');
    if (birds && birds.target > 0 && Math.random() < dt * 0.5 * birds.target) { const f = 2200 + Math.random() * 1800; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.toneAmb(f * (1 + i * 0.06), f * 1.25, 0.09, 0.05 * birds.target, i * 0.11); }
    if (night && night.target > 0 && Math.random() < dt * 0.25) this.toneAmb(180 + Math.random() * 40, 150, 0.4, 0.04, 0);
    if (this.musicMood === 'none') return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const mood = this.musicMood;
    const scale = mood === 'tense' ? [0, 2, 3, 7, 8] : mood === 'storm' ? [0, 3, 5, 6, 10] : mood === 'ocean' ? [0, 2, 4, 7, 9] : [0, 2, 4, 7, 9];
    const root = mood === 'tense' ? 196 : mood === 'storm' ? 174.6 : mood === 'ocean' ? 261.6 : 220 * (daylight < 0.3 ? 0.84 : 1);
    this.musicTimer = mood === 'tense' ? 0.32 : 0.5 + Math.random() * 0.25;
    this.step++;
    const n = (deg: number, oct: number): number => root * Math.pow(2, (scale[((deg % 5) + 5) % 5] + 12 * (oct + Math.floor(deg / 5))) / 12);
    if (this.step % 16 === 1) { const d = [0, 3, 2, 4][Math.floor(this.step / 16) % 4]; for (const k of [0, 2, 4]) this.tone('music', 'triangle', n(d + k, -1), n(d + k, -1), 7.5, 0.045, 0, 2.2); }
    const density = mood === 'tense' ? 0.75 : 0.42;
    if (Math.random() < density) { const d = Math.floor(Math.random() * 8); const f = n(d, mood === 'tense' ? 0 : 1); this.tone('music', mood === 'tense' ? 'square' : 'sine', f, f, mood === 'tense' ? 0.25 : 1.4, mood === 'tense' ? 0.03 : 0.06, 0, 0.01); if (Math.random() < 0.3) this.tone('music', 'sine', f * 2, f * 2, 1, 0.02, 0.12, 0.01); }
    if (mood === 'tense' && this.step % 2 === 0) this.burstMusic(0.07, this.step % 8 === 0 ? 0.2 : 0.07, this.step % 8 === 0 ? 150 : 2500);
  }
  private toneAmb(f0: number, f1: number, dur: number, vol: number, delay: number): void { this.tone('ambience', 'sine', f0, f1, dur, vol, delay); }
  private burstMusic(dur: number, vol: number, freq: number): void { this.burst('music', dur, vol, freq, freq * 0.5, 0.8, freq < 300 ? 'lowpass' : 'bandpass'); }
}

export const audio = new AudioManager();
