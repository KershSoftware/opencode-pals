import type { Character, Hat, Frame } from '../src/art/types'
import { catalog } from '../src/art/catalog'
import { poseAt } from '../src/art/timeline'

/** Default-export this object, or a Character directly, from a local trial file. */
export type PalTrial = { character: Character; hats?: Hat[] }
export const trialMoods = ['idle', 'thinking', 'working', 'waiting', 'done', 'error', 'interrupted'] as const
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const color = (v: unknown) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v)
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Invalid Pal trial: ${message}`) }
function named(v: unknown, label: string) {
  check(record(v) && typeof v.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(v.id)
    && typeof v.name === 'string' && v.name.trim(), `${label} needs a stable lowercase id and nonempty name`)
}
function frame(v: Frame, label: string) {
  check(record(v) && v.width === 24 && v.height === 24, `${label} must return a 24 × 24 frame`)
  check(Array.isArray(v.pixels) && v.pixels.length === 576
    && Array.from(v.pixels).every(p => p === null || color(p)), `${label} pixels must be 576 opaque #rrggbb or null values`)
}
export function validateTrial(value: unknown): PalTrial {
  check(record(value), 'default export must be a Character or { character, hats? }')
  const trial = ('character' in value ? value : { character: value }) as PalTrial
  const c = trial.character
  named(c, 'character')
  check(Array.isArray(c.skins) && c.skins.length, 'character needs at least one skin')
  const skins = new Set<string>()
  for (const skin of c.skins) {
    named(skin, 'skin'); check(!skins.has(skin.id), `duplicate skin ${skin.id}`); skins.add(skin.id)
    check(record(skin.palette) && Object.keys(skin.palette).length && Object.values(skin.palette).every(color), `skin ${skin.id} palette must contain opaque #rrggbb colors`)
  }
  check(record(c.anchor) && [c.anchor.x, c.anchor.y].every(n => Number.isInteger(n) && n >= 0 && n < 24), 'anchor must be integer coordinates inside 24 × 24')
  check(record(c.bounds) && Object.values(c.bounds).every(Number.isInteger)
    && c.bounds.x >= 0 && c.bounds.y >= 0 && c.bounds.width > 0 && c.bounds.height > 0
    && c.bounds.x + c.bounds.width <= 24 && c.bounds.y + c.bounds.height <= 24, 'bounds must be a nonempty integer rectangle inside 24 × 24')
  check(typeof c.draw === 'function', 'character.draw must be a function')
  check(trial.hats === undefined || Array.isArray(trial.hats), 'hats must be an array')
  const hats = new Map(catalog.hats.map(h => [h.id, h]))
  const supplied = new Set<string>()
  for (const hat of trial.hats ?? []) {
    named(hat, 'hat'); check(!supplied.has(hat.id), `duplicate hat ${hat.id}`); supplied.add(hat.id)
    check(hat.id !== 'none', 'the built-in none hat cannot be replaced')
    check(typeof hat.draw === 'function', `hat ${hat.id}.draw must be a function`); hats.set(hat.id, hat)
  }
  check(Array.isArray(c.hats) && c.hats.every(id => typeof id === 'string' && hats.has(id)), 'compatible hat IDs must exist in built-in or supplied hats')
  check(record(c.defaults) && skins.has(c.defaults.skin), 'default skin must exist')
  check(hats.has(c.defaults.hat) && (c.defaults.hat === 'none' || c.hats.includes(c.defaults.hat)), 'default hat must exist and be compatible')
  // Sample the real draw contract before native launch, including motion/extreme poses.
  for (const mood of trialMoods) for (const time of [0, 200, 400, 1200, 3700]) for (const skin of c.skins) {
    const pose = poseAt(mood, time, true)
    frame(c.draw(pose, skin), `${c.id}/${skin.id}/${mood}.draw`)
    for (const id of new Set(['none', ...c.hats])) frame(hats.get(id)!.draw(pose, c.anchor), `hat ${id}.draw`)
  }
  return trial
}
