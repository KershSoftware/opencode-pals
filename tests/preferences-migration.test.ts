import { expect, test } from 'bun:test'
import { createComputed, createMemo, createRoot, createSignal, untrack } from 'solid-js'
import { catalog } from '../src/art/catalog'
import { legacyPreferenceKey, loadPreferences, normalizePreferences, preferenceKey } from '../src/state/preferences'

const choices = { enabled: false, animate: false, character: 'jelly', appearances: { jelly: { skin: 'sky-blue', hat: 'none' } } }
// OpenCode 1.18.30 context/kv.tsx: null and missing both yield the default.
const hostGetter = (store: Record<string, unknown>) => (key: string, defaultValue?: unknown) => store[key] ?? defaultValue

test('imports legacy visibility, motion and appearance choices', () => {
  expect(loadPreferences(hostGetter({ [legacyPreferenceKey]: choices }), catalog)).toEqual(choices)
})

test('available new data wins without resetting valid choices', () => {
  for (const saved of [choices, { ...choices, enabled: true }, false, {}]) {
    const get = hostGetter({ [preferenceKey]: saved, [legacyPreferenceKey]: { ...choices, animate: true } })
    expect(loadPreferences(get, catalog)).toEqual(normalizePreferences(saved, catalog))
  }
})

test('nullish host results migrate legacy with either undefined or null defaults', () => {
  for (const saved of [undefined, null]) for (const defaultValue of [undefined, null]) {
    const get = hostGetter({ [preferenceKey]: saved, [legacyPreferenceKey]: choices })
    expect(get(preferenceKey, defaultValue)).toBe(defaultValue)
    expect(loadPreferences(key => get(key, defaultValue), catalog)).toEqual(choices)
  }
  expect(loadPreferences(hostGetter({ [preferenceKey]: null, [legacyPreferenceKey]: null }), catalog))
    .toEqual(normalizePreferences(undefined, catalog))
})

for (const saved of [undefined, null, choices]) test(`hydrated ${saved === null ? 'null' : saved ? 'valid' : 'missing'} data preserves choices and persists migration once`, () => {
  createRoot(dispose => {
    const [ready, setReady] = createSignal(false)
    const [data, setData] = createSignal<Record<string, unknown>>({})
    const kvGet = (key: string) => hostGetter(data())(key)
    const get = createMemo(() => loadPreferences(kvGet, catalog))
    let writes = 0
    createComputed(() => {
      if (!ready()) return
      const saved = kvGet(preferenceKey); const value = get()
      if (JSON.stringify(saved) !== JSON.stringify(value)) untrack(() => {
        writes++; setData(previous => ({ ...previous, [preferenceKey]: value }))
      })
    })
    expect(writes).toBe(0)
    const legacy = { ...choices, character: 'removed', appearances: { jelly: { skin: 'removed', hat: 'none' } } }
    setData({ [preferenceKey]: saved, [legacyPreferenceKey]: legacy })
    expect(writes).toBe(0)
    setReady(true)
    expect(data()[preferenceKey]).toEqual(choices)
    expect(writes).toBe(saved ? 0 : 1)
    setData(previous => ({ ...previous, [legacyPreferenceKey]: { ...choices, enabled: true } }))
    expect(get()).toEqual(choices)
    expect(writes).toBe(saved ? 0 : 1)
    dispose()
  })
})
