import { clamp } from '../../utils/rng';
import { nudge, remember, type DragonRecord, type MemoryKind } from '../DragonRecord';
import type { FoodId, Personality, Phenotype } from '../genetics/types';

/**
 * Taming rules. Every interaction is filtered through the individual's personality,
 * fears, likes and memories — the same gesture can win one dragon and scare another.
 */
export type TameEvent = { kind: MemoryKind | 'bondReady' | 'refused'; trust: number; fear: number; text?: string };
export const BOND_THRESHOLD = 85;

const COOLDOWNS: Partial<Record<MemoryKind, number>> = { pet: 4, petTooSoon: 3, respected: 30, calmed: 12, music: 15, noise: 6, played: 8, startled: 2 };

export class Bond {
  private cd = new Map<string, number>();
  events: TameEvent[] = [];
  constructor(readonly rec: DragonRecord, readonly ph: Phenotype, private traits: () => Personality) {}

  tick(dt: number): void { for (const [k, v] of this.cd) { if (v - dt <= 0) this.cd.delete(k); else this.cd.set(k, v - dt); } }
  private ready(k: MemoryKind): boolean { return !this.cd.has(k); }

  private apply(kind: MemoryKind, trust: number, fear: number, day: number, text?: string): TameEvent {
    const t = this.traits(), r = this.rec;
    const gain = trust > 0 ? trust * (0.7 + t.sociability * 0.6) * (r.bonded ? 0.5 : 1) : trust * (0.7 + t.sensitivity * 0.6);
    const before = r.trust;
    r.trust = clamp(r.trust + gain, 0, 100);
    r.fear = clamp(r.fear + fear * (fear > 0 ? 1.4 - t.courage : 1), 0, 100);
    remember(r, day, kind, trust - Math.max(0, fear) * 0.3);
    const cd = COOLDOWNS[kind]; if (cd) this.cd.set(kind, cd);
    const ev: TameEvent = { kind, trust: r.trust - before, fear, text };
    this.events.push(ev);
    if (!r.bonded && before < BOND_THRESHOLD && r.trust >= BOND_THRESHOLD) this.events.push({ kind: 'bondReady', trust: 0, fear: 0 });
    return ev;
  }

  /** Continuous fear from the player's presence. Returns fear delta per second (already applied). */
  presence(dt: number, dist: number, motion: 'still' | 'sneak' | 'walk' | 'run', inSight: boolean): void {
    const t = this.traits(), r = this.rec;
    if (r.bonded) { r.fear = Math.max(0, r.fear - 20 * dt); return; }
    const comfort = (50 + t.sensitivity * 90 + (1 - t.courage) * 50) * (1 - r.trust / 125);
    let rate = -4;
    if (inSight && dist < comfort) {
      const near = 1 - dist / comfort;
      rate = (motion === 'run' ? 16 : motion === 'walk' ? 5.5 : motion === 'sneak' ? 0.4 : -3) * (0.5 + near);
      if (rate > 0) rate *= (1.4 - t.courage) * (0.6 + t.sensitivity * 0.8) * (1 - r.trust / 110) * (r.injured ? 1.3 : 1);
    }
    r.fear = clamp(r.fear + rate * dt, 0, 100);
  }

  /** Quiet observation builds early trust and fills in the field notes. */
  observe(dt: number, day: number): void {
    const r = this.rec, t = this.traits();
    r.observed = clamp(r.observed + dt * (0.012 + t.curiosity * 0.012), 0, 1);
    if (r.trust < 28 && r.fear < 45) { r.trust = clamp(r.trust + dt * 0.7 * (0.6 + t.curiosity * 0.8), 0, 100); }
    if (!r.met) { r.met = true; remember(r, day, 'observed', 2); }
  }

  suddenMove(day: number, intensity = 1): void {
    if (this.rec.bonded || !this.ready('startled')) return;
    const f = this.ph.fears.includes('suddenMove') ? 1.6 : 1;
    this.apply('startled', -2 * intensity, 26 * intensity * f, day);
  }

  whistle(day: number): void {
    if (this.ph.fears.includes('noise') && this.ready('noise') && !this.rec.bonded) this.apply('noise', -3, 24, day, 'O assobio o assustou!');
    else if (this.ph.likes.includes('music') && this.ready('music')) this.apply('music', 4, -8, day, 'Ele gostou do assobio.');
  }

  calmGesture(day: number, facing: boolean): void {
    const r = this.rec;
    if (!facing || r.fear < 8 || !this.ready('calmed')) { r.fear = Math.max(0, r.fear - 0.25); return; }
    const t = this.traits();
    this.apply('calmed', 2, -(14 + t.intelligence * 22), day, 'Seu gesto o tranquilizou.');
    nudge(r, 'sensitivity', -0.004);
  }

  /** Would this dragon come and take food from the player's hand right now? */
  willTake(food: FoodId, playerStill: boolean): boolean {
    const r = this.rec, t = this.traits();
    const s = (r.trust / 100) * 0.6 + r.hunger * 0.5 + t.curiosity * 0.3 + (food === this.ph.favoriteFood ? 0.25 : 0) - (r.fear / 100) * 1.0 - (playerStill ? 0 : 0.3) + (r.injured ? 0.1 : 0);
    return s > 0.42;
  }

  feed(food: FoodId, day: number): TameEvent {
    const r = this.rec, hungry = 0.5 + r.hunger * 0.7;
    r.hunger = clamp(r.hunger - 0.45);
    if (food === 'herb' && (r.injured || r.hp < this.ph.stats.maxHp * 0.6)) {
      r.hp = Math.min(this.ph.stats.maxHp, r.hp + this.ph.stats.maxHp * 0.5); r.injured = false;
      return this.apply('healed', 16, -15, day, 'A erva curou seus ferimentos.');
    }
    if (food === this.ph.dislikedFood) return this.apply('fedDisliked', -3, 4, day, 'Ele cuspiu... não gosta disso.');
    const base = food === this.ph.favoriteFood ? 14 : this.ph.abilities.length && isSpeciesFood(this.ph, food) ? 9 : 4;
    nudge(r, 'sociability', 0.006);
    return this.apply('fed', base * hungry, -10, day, food === this.ph.favoriteFood ? 'É a comida favorita dele!' : undefined);
  }

  pet(day: number): TameEvent | null {
    const r = this.rec, t = this.traits();
    if (r.trust >= 35 - t.sociability * 8 && r.fear < 35) {
      if (!this.ready('pet')) return null;
      nudge(r, 'sensitivity', -0.003);
      return this.apply('pet', this.ph.likes.includes('petting') ? 7.5 : 5, -6, day);
    }
    if (!this.ready('petTooSoon')) return null;
    nudge(r, t.courage > 0.55 ? 'aggression' : 'courage', t.courage > 0.55 ? 0.01 : -0.01);
    return this.apply('petTooSoon', -4, 30, day, 'Cedo demais — ele ainda não confia em você.');
  }

  played(day: number): void { if (this.ready('played')) this.apply('played', this.ph.likes.includes('play') ? 9 : 5, -5, day); }
  respected(day: number): void { if (this.ready('respected')) { this.apply('respected', 6, -18, day, 'Você respeitou o território dele.'); nudge(this.rec, 'territoriality', -0.01); } }

  hurtByPlayer(day: number): void {
    const r = this.rec, t = this.traits();
    this.apply('hurtByHuman', r.bonded ? -12 : -35, 50, day, 'Você feriu o dragão. Ele não vai esquecer.');
    nudge(r, t.courage > 0.5 ? 'aggression' : 'courage', t.courage > 0.5 ? 0.04 : -0.04);
    nudge(r, 'sociability', -0.03);
  }

  freed(day: number): void { this.rec.trapped = false; this.apply('freed', 24, -25, day, 'Você libertou o dragão!'); nudge(this.rec, 'loyalty', 0.03); }

  canBond(): boolean { return !this.rec.bonded && this.rec.trust >= BOND_THRESHOLD && this.rec.fear < 25; }
  completeBond(day: number): void {
    const r = this.rec;
    r.bonded = true; r.follow = true; r.fear = 0; r.trust = Math.max(r.trust, 88);
    remember(r, day, 'bonded', 30);
    nudge(r, 'loyalty', 0.05); nudge(r, 'courage', 0.03);
    this.events.push({ kind: 'bonded', trust: 0, fear: 0 });
  }

  /** Bonded dragons do not obey blindly: independence, training and mood all matter. */
  obeys(command: 'come' | 'stay' | 'attack' | 'mount', roll: number): boolean {
    const r = this.rec, t = this.traits();
    if (!r.bonded) return false;
    let p = 0.55 + (r.trust - 85) / 60 + r.training / 160 + t.loyalty * 0.25 - t.independence * 0.3 - (r.hunger > 0.85 ? 0.25 : 0) - (r.energy < 0.12 ? 0.2 : 0);
    if (command === 'attack') p += t.aggression * 0.2 + t.protectiveness * 0.15 - (1 - t.courage) * 0.2;
    if (command === 'mount') p += 0.25;
    const ok = roll < clamp(p, 0.15, 1);
    if (ok) r.training = clamp(r.training + 1.2, 0, 100);
    return ok;
  }

  drain(): TameEvent[] { const e = this.events; this.events = []; return e; }
}

import { SPECIES } from '../genetics/species';
function isSpeciesFood(ph: Phenotype, food: FoodId): boolean { return SPECIES[ph.species].foods.includes(food); }
