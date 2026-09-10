import type { Appearance, Catalog } from '../art/types'

export type Preferences = {
  enabled: boolean; animate: boolean; character: string
  appearances: Record<string, { skin: string; hat: string }>
}
export const preferenceKey = 'opencode-pals.preferences.v1'
export const legacyPreferenceKey = 'jelly-pet.preferences.v1'

// The host getter uses store[key] ?? defaultValue: null and absence are equivalent.
// Available non-nullish Pals data wins. Persisting the normalized result after
// hydration makes legacy import a one-time action without resetting valid choices.
export function loadPreferences(get: (key: string) => unknown, catalog: Catalog): Preferences {
  const saved = get(preferenceKey)
  return normalizePreferences(saved ?? get(legacyPreferenceKey), catalog)
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const own = (value: unknown, key: string): unknown => record(value) && Object.hasOwn(value, key) ? value[key] : undefined

export function normalizePreferences(value: unknown, catalog: Catalog): Preferences {
  const fallback = catalog.characters.find(c => c.id === 'jelly') ?? catalog.characters[0]
  if (!fallback) throw new Error('Pals catalog requires a character')
  const character = catalog.characters.find(c => c.id === own(value, 'character')) ?? fallback
  const saved = own(value, 'appearances')
  const appearances = Object.fromEntries(catalog.characters.map(c => {
    const entry = own(saved, c.id)
    const skin = c.skins.find(s => s.id === own(entry, 'skin'))?.id ?? c.defaults.skin
    const requestedHat = own(entry, 'hat')
    const hat = typeof requestedHat === 'string' && (requestedHat === 'none' ||
      c.hats.includes(requestedHat) && catalog.hats.some(h => h.id === requestedHat)) ? requestedHat : c.defaults.hat
    return [c.id, { skin, hat }]
  }))
  const enabled = own(value, 'enabled'); const animate = own(value, 'animate')
  return { enabled: typeof enabled === 'boolean' ? enabled : true,
    animate: typeof animate === 'boolean' ? animate : true, character: character.id, appearances }
}

export function selectCharacter(p: Preferences, id: string, catalog: Catalog): Preferences {
  return normalizePreferences({ ...p, character: id }, catalog)
}
export function selectedAppearance(p: Preferences): Appearance {
  return { character: p.character, ...p.appearances[p.character]! }
}
