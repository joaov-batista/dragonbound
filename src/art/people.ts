import { Pix } from './Pix';
import { drawHero, heroPose, type HeroStyle } from './hero';
import { HERO_FRAME, type HeroAnim } from './heroAnims';

/** Everyone who is not the protagonist: villagers, hunters and the human boss, all on the hero rig. */
const base = { leather: 0x6a4a2e, band: null, scarf: null, beard: 'none', hat: 'none', hairStyle: 'tuft', pants: 0x6a5a48 } as const;
export const PEOPLE: Record<string, HeroStyle> = {
  ragna: { ...base, skin: 0xe0a878, hair: 0xd8ccb0, hairStyle: 'braid', tunic: 0x8a2e3a, pants: 0x4a3a30, cloak: 0x4a6a52, band: 0xf2c14e },
  olvar: { ...base, skin: 0xc8865a, hair: 0xa8442a, hairStyle: 'bald', beard: 'long', tunic: 0x5a4a3a, apron: 0x3a2a24, bulk: 1.25 },
  sigrun: { ...base, skin: 0xe8b890, hair: 0xf0d080, hairStyle: 'bun', tunic: 0x3f7a9a, apron: 0xe8e0d0 },
  kael: { ...base, skin: 0x8a5a3a, hair: 0x1a1414, tunic: 0x6a8a3a, scarf: 0xf2c14e },
  ingrid: { ...base, skin: 0xe0b090, hair: 0xe8e8e8, hairStyle: 'long', tunic: 0x5a4a7a, cloak: 0x3a3050, hat: 'hood', hatColor: 0x4a3a66 },
  bjarni: { ...base, skin: 0xd09a6a, hair: 0x6a4a2a, beard: 'short', tunic: 0x8a6a3a, hat: 'cap', hatColor: 0x4a6a3a },
  mira: { ...base, skin: 0xa86a4a, hair: 0x2a1a2a, hairStyle: 'braid', tunic: 0x2f6f7a, scarf: 0xd8a030 },
  halvar: { ...base, skin: 0xd8a070, hair: 0x4a3a2a, beard: 'short', tunic: 0x5a6070, hat: 'helm', bulk: 1.1 },
  tor: { ...base, skin: 0xc08060, hair: 0x9a9aa0, beard: 'long', tunic: 0x3a5a7a, hat: 'cap', hatColor: 0x2a3a5a },
  ivo: { ...base, skin: 0xe0a070, hair: 0xd8a040, tunic: 0xc8463a, bulk: 0.85 },
  lia: { ...base, skin: 0x9a6a4a, hair: 0x5a2a1a, hairStyle: 'bun', tunic: 0x8a5ac8, bulk: 0.85, scarf: 0x7fe8d0 },
  hunter: { ...base, skin: 0xc89070, hair: 0x2a2020, tunic: 0x4a3a34, pants: 0x3a3030, scarf: 0x8a1a1a, hat: 'hood', hatColor: 0x2a2420 },
  hunter2: { ...base, skin: 0xb07858, hair: 0x3a2a20, beard: 'short', tunic: 0x5a4038, pants: 0x3a3030, scarf: 0x8a1a1a, hat: 'helm', hatColor: 0x5a5a64 },
  bruto: { ...base, skin: 0xb8805a, hair: 0x3a2a20, hairStyle: 'bald', beard: 'long', tunic: 0x5a5a64, pants: 0x3a3030, cloak: 0x6a1a1a, bulk: 1.45 },
  varga: { ...base, skin: 0xd8a888, hair: 0xb02a1a, hairStyle: 'long', tunic: 0x2a2a34, pants: 0x2a2a34, cloak: 0x8a1a1a, band: 0xc0c0c0 },
};
export type PersonId = keyof typeof PEOPLE;
/** Per character: idle, walk (the run cycle played slowly), talk gestures, a work/attack swing and a hurt frame. */
export const PEOPLE_ANIMS: [string, HeroAnim, number][] = [['idle', 'idle', 6], ['walk', 'run', 8], ['talk', 'offer', 2], ['work', 'attack1', 4], ['hurt', 'hurt', 1]];

export function paintPeopleAtlas(): { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> } {
  const ids = Object.keys(PEOPLE), per = PEOPLE_ANIMS.reduce((n, a) => n + a[2], 0), cols = 21;
  const pix = new Pix(cols * HERO_FRAME, ids.length * HERO_FRAME * Math.ceil(per / cols));
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  ids.forEach((id, r) => {
    let c = 0;
    for (const [name, anim, n] of PEOPLE_ANIMS) for (let i = 0; i < n; i++, c++) {
      const x = c * HERO_FRAME, y = r * HERO_FRAME;
      drawHero(pix, x, y, heroPose(anim, i), PEOPLE[id]);
      frames[`${id}_${name}_${i}`] = { x, y, w: HERO_FRAME, h: HERO_FRAME };
    }
  });
  return { pix, frames };
}
