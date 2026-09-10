import { expect, test } from 'bun:test'
import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { normalizePreferences, selectCharacter, selectedAppearance } from '../src/state/preferences'
import { appearanceOptions } from '../src/tui/menu-options'
import { extendedCatalog } from './fixtures/catalog'

test('corrupt saved values receive defaults and strict boolean validation', () => {
  const defaults = normalizePreferences(undefined, catalog)
  expect(selectedAppearance(defaults)).toEqual({ character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' })
  for (const value of [null, false, 12, 'bad', [], { enabled: 'false', animate: 0, appearances: [] }])
    expect(normalizePreferences(value, catalog)).toEqual(defaults)
  expect(normalizePreferences({ enabled: false, animate: false }, catalog)).toEqual({ ...defaults, enabled: false, animate: false })
})
test('removed IDs fall back and only recognized own entries are copied freshly', () => {
  const saved = { character: 'removed', appearances: { jelly: { skin: 'removed', hat: 'removed', extra: 1 }, removed: { skin: 'x', hat: 'x' } }, extra: true }
  const p = normalizePreferences(saved, catalog)
  expect(p).toEqual(normalizePreferences(undefined, catalog))
  expect(p.appearances.jelly).not.toBe(saved.appearances.jelly)
  expect(normalizePreferences(Object.create({ enabled: false, character: 'sprout' }), extendedCatalog).character).toBe('jelly')
})
test('keeps the bare jelly choice across validation', () => {
  const p = normalizePreferences(undefined, catalog)
  p.appearances.jelly!.hat = 'none'
  expect(selectedAppearance(normalizePreferences(p, catalog))).toEqual({ character: 'jelly', skin: 'sky-blue', hat: 'none' })
})
test('incompatible accessory falls back and character switches restore independent choices', () => {
  let p = normalizePreferences(undefined, extendedCatalog)
  p.appearances.jelly!.hat = 'none'
  p.appearances.sprout = { skin: 'gold', hat: 'lavender-bucket' }
  p = selectCharacter(p, 'sprout', extendedCatalog)
  expect(selectedAppearance(p)).toEqual({ character: 'sprout', skin: 'gold', hat: 'none' })
  p = selectCharacter(p, 'jelly', extendedCatalog)
  expect(selectedAppearance(p).hat).toBe('none')
  expect(selectedAppearance(selectCharacter(p, 'sprout', extendedCatalog)).skin).toBe('gold')
  expect(selectCharacter(p, 'removed', extendedCatalog).character).toBe('jelly')
})
test('catalog-derived picker options discover test creature/skins and compatible hats', () => {
  const p = selectCharacter(normalizePreferences(undefined, extendedCatalog), 'sprout', extendedCatalog)
  expect(appearanceOptions(extendedCatalog, p, 'character').map(o => o.value)).toEqual(['jelly', 'sprout'])
  expect(appearanceOptions(extendedCatalog, p, 'skin').map(o => o.value)).toEqual(['green', 'gold'])
  expect(appearanceOptions(extendedCatalog, p, 'hat').map(o => o.value)).toEqual(['none'])
  expect(compose(extendedCatalog, selectedAppearance(p), 'idle', 0, false).pixels.filter(Boolean)).toEqual(Array(16).fill('#00aa44'))
  expect(catalog.characters.map(c => c.id)).toEqual(['jelly'])
})
