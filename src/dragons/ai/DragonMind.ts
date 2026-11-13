import type { IconId } from '../../art/ui';
import { clamp, hashInts, mulberry32, type Rng } from '../../utils/rng';
import { effectiveTraits, type DragonRecord } from '../DragonRecord';
import type { FoodId, Personality, Phenotype } from '../genetics/types';
import type { DragonAnim } from '../rendering/dragonAnims';
import { Bond } from '../taming/Bond';

export type MindState = 'explore' | 'rest' | 'forage' | 'eat' | 'sleep' | 'investigate' | 'flee' | 'defend' | 'attack' | 'play' | 'approach' | 'follow' | 'protect' | 'stay' | 'startled' | 'bonding' | 'trapped' | 'downed';

export interface Percept {
  dt: number; day: number; night: boolean; storm: boolean;
  x: number; y: number; grounded: boolean; stuck: boolean;
  player: { x: number; y: number; dist: number; motion: 'still' | 'sneak' | 'walk' | 'run'; visible: boolean; offering: FoodId | null; gesturing: boolean; mounted: boolean; threatened: boolean; alive: boolean };
  threat: { x: number; y: number; dist: number } | null;       // hostile creature near the dragon or its human
  food: { x: number; y: number; dist: number } | null;         // nearest natural food source
  other: { x: number; y: number; dist: number; bondedWithPlayer: boolean } | null;
}

export interface Intent {
  state: MindState; tx: number; ty: number; speed: number; fly: boolean; anim: DragonAnim; emote: IconId | null;
  face: number; strike: boolean; ateWorldFood: boolean; tookOffer: boolean; vocal: 'chirp' | 'growl' | 'roar' | 'purr' | 'whine' | null;
}

/**
 * Utility-based dragon brain. Needs (hunger, energy, safety, company, curiosity, territory)
 * are scored through the individual's personality every few hundred ms; the winning drive
 * becomes the state, and each state runs a small behaviour. No two dragons weigh things alike.
 */
export class DragonMind {
  state: MindState = 'rest';
  readonly bond: Bond;
  traits: Personality;
  private rng: Rng;
  private think = 0; private lock = 0; private stateT = 0;
  private wx = 0; private wy = 0; private wanderT = 0; private warnT = 0; private anger = 0; private novelty = 1;
  private strikeCd = 0; private side = 1; private vocalCd = 2;
  bondHold = 0;
  scores: Partial<Record<MindState, number>> = {};

  constructor(readonly rec: DragonRecord, readonly ph: Phenotype) {
    this.traits = effectiveTraits(ph.personality, rec);
    this.bond = new Bond(rec, ph, () => this.traits);
    this.rng = mulberry32(hashInts(rec.genes.seed, 0xa11));
    this.wx = rec.homeX; this.wy = rec.homeY;
    this.think = this.rng() * 0.4;
    if (rec.trapped) this.state = 'trapped';
  }

  provoke(amount = 1): void { this.anger = Math.min(1.5, this.anger + amount); this.lock = 0; this.think = 0; }
  force(s: MindState, lock = 0): void { this.state = s; this.lock = lock; this.stateT = 0; }

  private territoryIntruded(p: Percept): boolean {
    const r = this.rec;
    return !r.bonded && p.player.alive && p.player.visible && Math.hypot(p.player.x - r.homeX, p.player.y - r.homeY) < r.homeR * (0.45 + this.traits.territoriality * 0.5);
  }

  private decide(p: Percept): MindState {
    const r = this.rec, t = this.traits, pl = p.player;
    const fear = r.fear / 100, trust = r.trust / 100;
    const near = pl.alive && pl.dist < 240 && pl.visible;
    const s: Partial<Record<MindState, number>> = {};
    s.rest = 0.22;
    s.explore = 0.14 + t.curiosity * 0.36 * (r.energy > 0.25 ? 1 : 0.4);
    s.sleep = (1 - r.energy) ** 2 * 1.25 + (p.night ? 0.32 : 0) - fear * 1.2 - (p.threat ? 0.6 : 0);
    s.forage = p.food ? r.hunger ** 1.5 * 1.15 : r.hunger ** 2 * 0.3;
    s.flee = r.bonded ? 0 : fear * (1.45 - t.courage) + (p.storm && this.ph.fears.includes('storm') ? 0.35 : 0);
    if (!r.bonded && near) {
      s.investigate = t.curiosity * (1 - fear) * (0.45 + this.novelty * 0.5) + (pl.offering ? 0.25 + r.hunger * 0.3 : 0) + trust * 0.2;
      if (this.territoryIntruded(p)) s.defend = t.territoriality * (1 - trust * 1.3) * 1.15 + this.anger * 0.2;
      s.approach = trust > 0.5 ? t.sociability * trust * 0.95 - fear : 0;
      s.play = trust > 0.55 && r.energy > 0.35 && r.hunger < 0.7 ? t.sociability * 0.5 + (this.ph.likes.includes('play') ? 0.3 : 0) - fear : 0;
    }
    s.attack = this.anger * (0.5 + t.aggression * 0.8 + t.courage * 0.3) - (fear > 0.7 && t.courage < 0.5 ? 0.6 : 0);
    if (r.bonded) {
      const needy = r.hunger > 0.9 || r.energy < 0.08;
      s.follow = r.follow ? (needy ? 0.4 : 0.92 - t.independence * 0.22) : 0;
      s.stay = r.follow ? 0 : 0.8;
      if (p.threat && (pl.threatened || p.threat.dist < 70)) s.protect = t.protectiveness * 0.8 + t.loyalty * 0.4 + t.courage * 0.2 + this.anger * 0.3;
      if (pl.dist < 90 && r.energy > 0.4 && !pl.mounted && !p.threat) s.play = (t.sociability * 0.5 + (this.ph.likes.includes('play') ? 0.25 : 0)) * (this.rng() < 0.25 ? 1.6 : 0.6);
    } else if (p.threat && p.threat.dist < 60) { s.attack = Math.max(s.attack ?? 0, t.aggression * 0.7 + t.courage * 0.4); s.flee = Math.max(s.flee ?? 0, (1 - t.courage) * 0.8); }
    if (p.other && !r.bonded && p.other.dist < 120 && r.energy > 0.4) s.play = Math.max(s.play ?? 0, t.sociability * 0.42);
    s[this.state] = (s[this.state] ?? 0) + 0.1; // hysteresis
    this.scores = s;
    let best: MindState = 'rest', bs = -1;
    for (const k of Object.keys(s) as MindState[]) { const v = (s[k] ?? 0) + this.rng() * 0.04; if (v > bs) { bs = v; best = k; } }
    return best;
  }

  update(p: Percept): Intent {
    const r = this.rec, t = this.traits, pl = p.player, dt = p.dt;
    this.traits = effectiveTraits(this.ph.personality, r);
    this.bond.tick(dt);
    this.stateT += dt; this.lock -= dt; this.strikeCd -= dt; this.vocalCd -= dt;
    this.anger = Math.max(0, this.anger - dt * 0.12);
    // needs
    const asleep = this.state === 'sleep' || this.state === 'downed';
    r.hunger = clamp(r.hunger + dt / 300);
    r.energy = clamp(r.energy + (asleep ? dt / 45 : this.state === 'rest' ? dt / 400 : -dt / 520));
    if (r.hp < this.ph.stats.maxHp && !r.injured) r.hp = Math.min(this.ph.stats.maxHp, r.hp + dt * (asleep ? 3 : 0.6));
    // social perception
    if (pl.alive) {
      this.bond.presence(dt, pl.dist, pl.motion, pl.visible && !asleep);
      if (pl.visible && pl.dist < 190 && pl.dist > 34 && (pl.motion === 'still' || pl.motion === 'sneak') && this.state !== 'flee') { this.bond.observe(dt, p.day); this.novelty = Math.max(0.15, this.novelty - dt * 0.01); }
      if (pl.gesturing && pl.dist < 170 && pl.visible) this.bond.calmGesture(p.day, true);
    }

    const out: Intent = { state: this.state, tx: p.x, ty: p.y, speed: 0, fly: false, anim: 'idle', emote: null, face: 0, strike: false, ateWorldFood: false, tookOffer: false, vocal: null };
    const voc = (v: Intent['vocal'], cd = 4): void => { if (this.vocalCd <= 0) { out.vocal = v; this.vocalCd = cd + this.rng() * 3; } };

    // hard states
    if (r.trapped) { this.state = 'trapped'; out.state = 'trapped'; out.anim = this.stateT % 2 < 0.3 ? 'hurt' : 'idle'; out.emote = 'e_hurt'; out.face = Math.sign(pl.x - p.x); voc('whine', 5); return out; }
    if (r.hp <= 0 || this.state === 'downed') {
      if (this.state !== 'downed') { this.state = 'downed'; this.stateT = 0; }
      if (r.hp > this.ph.stats.maxHp * 0.3 && this.stateT > 4) this.state = 'rest';
      out.state = 'downed'; out.anim = 'sleep'; out.emote = 'e_hurt'; return out;
    }
    if (this.state === 'bonding') {
      out.state = 'bonding'; out.anim = 'nuzzle'; out.emote = 'e_heart'; out.face = Math.sign(pl.x - p.x) || 1; out.tx = pl.x - out.face * 26; out.ty = pl.y; out.speed = Math.abs(out.tx - p.x) > 6 ? 0.35 : 0;
      if (!this.bond.canBond() || pl.dist > 80) { this.state = 'rest'; this.bondHold = 0; }
      return out;
    }

    if (this.lock <= 0 && (this.think -= dt) <= 0) {
      this.think = 0.3 + this.rng() * 0.15;
      const next = this.decide(p);
      if (next !== this.state) {
        if (this.state === 'defend' && next !== 'attack' && this.warnT > 0 && !this.territoryIntruded(p)) this.bond.respected(p.day);
        this.state = next; this.stateT = 0;
        if (next === 'defend') this.warnT = 2.2 + (1 - t.aggression) * 3.5;
        if (next === 'flee') voc('whine', 3);
      }
    }
    out.state = this.state;
    const dxp = pl.x - p.x, facePl = Math.sign(dxp) || 1;
    const goto = (x: number, y: number, speed: number, fly = false): void => { out.tx = x; out.ty = y; out.speed = speed; out.fly = fly || Math.abs(y - p.y) > 44 || p.stuck; };

    switch (this.state) {
      case 'rest': out.anim = 'idle'; if (r.hunger > 0.6) out.emote = 'e_hungry'; break;
      case 'stay': out.anim = this.stateT > 6 && r.energy < 0.6 ? 'sleep' : 'idle'; out.face = facePl; break;
      case 'sleep':
        if (Math.hypot(r.homeX - p.x, r.homeY - p.y) > 60 && this.stateT < 14 && !r.bonded) { goto(r.homeX, r.homeY, 0.55); out.anim = 'walk'; }
        else { out.anim = 'sleep'; out.emote = 'e_sleep'; }
        break;
      case 'explore': {
        this.wanderT -= dt;
        if (this.wanderT <= 0 || p.stuck) {
          this.wanderT = 3 + this.rng() * 5;
          const a = this.rng() * 6.283, d = this.rng() * r.homeR * (0.5 + t.curiosity * 0.6);
          this.wx = r.homeX + Math.cos(a) * d; this.wy = r.homeY + Math.sin(a) * d * 0.25 - (this.rng() < 0.12 + t.curiosity * 0.1 ? 60 : 0);
        }
        if (Math.abs(this.wx - p.x) > 10) { goto(this.wx, this.wy, 0.5, this.wy < p.y - 40); out.anim = 'walk'; } else out.anim = 'idle';
        if (this.rng() < dt * 0.05) voc('chirp');
        break;
      }
      case 'forage':
        if (p.food) {
          if (p.food.dist > 22) { goto(p.food.x, p.food.y, 0.7); out.anim = 'walk'; }
          else { this.state = 'eat'; this.lock = 2.4; this.stateT = 0; out.ateWorldFood = true; r.hunger = clamp(r.hunger - 0.55); }
        } else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = 4; this.wx = r.homeX + (this.rng() - 0.5) * r.homeR * 2; } goto(this.wx, r.homeY, 0.6); out.anim = 'walk'; out.emote = 'e_hungry'; }
        break;
      case 'eat': out.anim = 'eat'; if (this.lock <= 0) this.state = 'rest'; break;
      case 'startled': out.anim = 'hurt'; out.emote = 'e_alert'; out.face = facePl; if (this.lock <= 0) this.state = 'flee'; break;
      case 'flee': {
        const away = p.x - facePl * 260, flyAway = r.fear > 55 && !r.injured;
        goto(away, flyAway ? p.y - 90 : p.y, r.injured ? 0.5 : 1, flyAway); out.anim = 'walk'; out.emote = 'e_fear';
        break;
      }
      case 'investigate': {
        out.face = facePl;
        const want = pl.offering && this.bond.willTake(pl.offering, pl.motion === 'still') ? 24 : Math.max(46, 120 - r.trust * 0.9 - t.courage * 30);
        if (pl.offering && pl.dist < 42 && this.bond.willTake(pl.offering, pl.motion === 'still')) { out.tookOffer = true; this.state = 'eat'; this.lock = 2.2; this.stateT = 0; out.anim = 'eat'; break; }
        if (pl.dist > want + 14) { goto(pl.x - facePl * want, pl.y, pl.offering ? 0.45 : 0.4); out.anim = 'walk'; }
        else if (pl.dist < want - 18 && !pl.offering) { goto(p.x - facePl * 40, p.y, 0.5); out.anim = 'walk'; }
        else out.anim = this.stateT % 5 > 3.6 ? 'alert' : 'idle';
        out.emote = pl.offering ? (this.bond.willTake(pl.offering, pl.motion === 'still') ? 'e_hungry' : 'e_question') : r.fear > 40 ? 'e_alert' : 'e_question';
        if (this.rng() < dt * 0.12) voc('chirp');
        if (this.bond.canBond() && pl.dist < 70 && pl.motion === 'still') { this.state = 'bonding'; this.stateT = 0; }
        break;
      }
      case 'approach': {
        out.face = facePl;
        if (pl.offering && pl.dist < 44 && this.bond.willTake(pl.offering, true)) { out.tookOffer = true; this.state = 'eat'; this.lock = 2.2; out.anim = 'eat'; break; }
        if (pl.dist > 40) { goto(pl.x - facePl * 28, pl.y, 0.6); out.anim = 'walk'; } else { out.anim = 'nuzzle'; out.emote = 'e_happy'; voc('purr', 5); }
        if (this.bond.canBond() && pl.dist < 70 && pl.motion === 'still') { this.state = 'bonding'; this.stateT = 0; }
        break;
      }
      case 'play': {
        const tgt = r.bonded || !p.other || (pl.visible && pl.dist < 140) ? pl : p.other;
        if (this.stateT % 2.4 < dt) this.side = -this.side;
        const gx = tgt.x + this.side * 46;
        if (Math.abs(gx - p.x) > 12) { goto(gx, tgt.y, 0.95); out.anim = 'walk'; } else { out.anim = 'play'; out.face = Math.sign(tgt.x - p.x) || 1; }
        out.emote = 'e_note'; if (this.rng() < dt * 0.4) voc('chirp', 2);
        if (tgt === pl && pl.dist < 70 && this.stateT > 3) { this.bond.played(p.day); this.stateT = 0; }
        if (this.stateT > 9) { this.state = 'rest'; r.energy = clamp(r.energy - 0.05); }
        break;
      }
      case 'defend': {
        out.face = facePl; out.anim = 'alert'; out.emote = 'e_anger'; voc('growl', 2);
        this.warnT -= dt;
        if (!this.territoryIntruded(p)) { this.bond.respected(p.day); this.state = 'rest'; this.lock = 1; }
        else if (this.warnT <= 0) { this.provoke(0.8); this.state = 'attack'; }
        break;
      }
      case 'attack': case 'protect': {
        const tg = this.state === 'protect' && p.threat ? p.threat : p.threat && (r.bonded || p.threat.dist < pl.dist) ? p.threat : r.bonded ? null : pl;
        if (!tg) { this.state = 'rest'; break; }
        const dx = tg.x - p.x; out.face = Math.sign(dx) || 1; out.emote = 'e_anger';
        const range = 46 * this.ph.size;
        if (Math.abs(dx) > range || Math.abs(tg.y - p.y) > 40) { goto(tg.x - out.face * range * 0.8, tg.y, 1); out.anim = 'walk'; }
        else if (this.strikeCd <= 0) { out.strike = true; out.anim = 'attack'; this.strikeCd = 1.5 - t.aggression * 0.5; this.lock = 0.45; voc('roar', 2); }
        else out.anim = this.strikeCd > 1 ? 'attack' : 'alert';
        if (!r.bonded && tg === pl && (pl.dist > r.homeR * 1.4 || this.stateT > 7)) { this.anger = Math.max(0, this.anger - 0.5); if (this.anger < 0.3) this.state = 'rest'; }
        break;
      }
      case 'follow': {
        const gx = pl.x - (Math.sign(pl.x - p.x) || 1) * (34 + this.ph.size * 14);
        const far = pl.dist > 190 || Math.abs(pl.y - p.y) > 54;
        if (Math.abs(gx - p.x) > 20 || far) { goto(gx, pl.y - (far ? 26 : 0), pl.dist > 110 ? 1 : 0.6, far); out.anim = 'walk'; }
        else { out.anim = 'idle'; out.face = facePl; if (r.hunger > 0.7) out.emote = 'e_hungry'; }
        if (pl.offering && pl.dist < 40) { out.tookOffer = true; this.state = 'eat'; this.lock = 2; out.anim = 'eat'; }
        break;
      }
    }
    if (out.speed > 0 && out.face === 0) out.face = Math.sign(out.tx - p.x) || 1;
    return out;
  }
}
