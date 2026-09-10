import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createSolidSlotRegistry, Slot } from '@opentui/solid'
import { children, createComponent, createRoot, onCleanup } from 'solid-js'
import type { TuiSlotContext, TuiSlotMap, TuiPluginApi, TuiSlotPlugin } from '@opencode-ai/plugin/tui'
import { decorateFooter } from '../src/tui/footer'

test('queued withdrawal is cancelled on disposal and cannot unregister the next activation', async () => {
  const { renderer } = await createTestRenderer({ width: 80, height: 24 })
  const context = { theme: {} } as TuiSlotContext
  const registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, context)
  const callbacks: (() => unknown)[] = []; const registrations: (() => void)[] = []
  const abort = new AbortController(); let count = 0
  try {
    registry.register({ id: 'internal:sidebar-footer', order: 100, slots: { sidebar_footer: () => 'original' } })
    decorateFooter({
      slots: { register(plugin: TuiSlotPlugin) { const id = `pet:${count++}`; registrations.push(registry.register({ ...plugin, id })); return id } },
      lifecycle: { signal: abort.signal, onDispose(fn) { callbacks.push(fn); return () => {} } },
    }, original => original)
    registry.unregister('internal:sidebar-footer')
    abort.abort(); for (const callback of callbacks) await callback()
    for (const unregister of registrations) unregister()
    registry.register({ id: 'pet:1', order: 99, slots: { sidebar_footer: () => 'new activation' } })
    await Bun.sleep(0)
    expect(registry.resolveEntries('sidebar_footer').map(e => e.renderer(context, { session_id: 's' }))).toEqual(['new activation'])
  } finally { renderer.destroy() }
})

for (const timing of ['before', 'after']) for (const change of ['remove', 'replace', 'competitor']) {
  test(`mounted Slot ${timing} decoration unmounts on ${change}`, async () => {
    const { renderer } = await createTestRenderer({ width: 80, height: 24 })
    const context = { theme: {} } as TuiSlotContext
    const registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, context)
    const cleanups: (() => unknown)[] = []
    const abort = new AbortController()
    let count = 0; let active = 0
    const api: Pick<TuiPluginApi, 'slots' | 'lifecycle'> = {
      slots: { register(plugin: TuiSlotPlugin) { const id = `pet:${count++}`; cleanups.push(registry.register({ ...plugin, id })); return id } },
      lifecycle: { signal: abort.signal, onDispose(fn) { cleanups.push(fn); return () => {} } },
    }
    let mounted!: ReturnType<typeof children>
    const mount = () => createRoot(dispose => {
      cleanups.push(dispose)
      const slot = createComponent(Slot<TuiSlotMap, TuiSlotContext, 'sidebar_footer'>, { registry, name: 'sidebar_footer', mode: 'single_winner', session_id: 's' })
      mounted = children(() => slot)
    })
    try {
      if (timing === 'before') mount()
      registry.register({ id: 'internal:sidebar-footer', order: 100, slots: { sidebar_footer: () => 'original' } })
      decorateFooter(api, original => (ctx, props) => { active++; onCleanup(() => active--); return ['pet', original(ctx, props)] })
      await Bun.sleep(0)
      registry.register({ id: 'activation-drain', slots: {} })
      if (timing === 'after') mount()
      await Bun.sleep(0)
      expect(mounted()).toEqual(['pet', 'original'])
      expect(active).toBeGreaterThan(0)
      if (change === 'competitor') registry.register({ id: 'custom', order: 150, slots: { sidebar_footer: () => 'custom' } })
      else {
        registry.unregister('internal:sidebar-footer')
        if (change === 'replace') registry.register({ id: 'internal:sidebar-footer', order: 100, slots: { sidebar_footer: () => 'replacement' } })
      }
      await Bun.sleep(0)
      expect(mounted()).toEqual(change === 'remove' ? null : change === 'replace' ? 'replacement' : 'original')
      expect(active).toBe(0)
      expect(registry.resolveEntries('sidebar_footer').some(e => e.id.startsWith('pet:'))).toBe(false)
    } finally { abort.abort(); for (const cleanup of cleanups.reverse()) await cleanup(); renderer.destroy() }
  })
}

test('decorates the real registry winner and yields permanently to a later competing footer', async () => {
  const { renderer } = await createTestRenderer({ width: 80, height: 24 })
  const context = { theme: {} } as TuiSlotContext
  const registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, context)
  const cleanups: (() => unknown)[] = []
  let count = 0
  const api: Pick<TuiPluginApi, 'slots' | 'lifecycle'> = {
    slots: { register(plugin: TuiSlotPlugin) {
      const id = `pet:${count++}`
      cleanups.push(registry.register({ ...plugin, id }))
      return id
    } },
    lifecycle: { signal: new AbortController().signal, onDispose(fn) { cleanups.push(fn); return () => {} } },
  }
  try {
    registry.register({ id: 'internal:sidebar-footer', order: 100,
      slots: { sidebar_footer: () => 'original path/version' } })
    expect(decorateFooter(api, original => (ctx, props) => ['extra row', original(ctx, props)])).toBe(true)
    const winner = () => registry.resolveEntries('sidebar_footer')[0]!
    expect(winner().renderer(context, { session_id: 'test' })).toEqual(['extra row', 'original path/version'])
    const remove = registry.register({ id: 'custom', order: 0, slots: { sidebar_footer: () => 'custom footer' } })
    await Bun.sleep(0)
    expect(winner().renderer(context, { session_id: 'test' })).toBe('custom footer')
    expect(registry.resolveEntries('sidebar_footer').map(entry => entry.id)).toEqual(['custom', 'internal:sidebar-footer'])
    remove()
    expect(winner().renderer(context, { session_id: 'test' })).toBe('original path/version')
    expect(decorateFooter(api, original => original)).toBe(true)
    registry.unregister('internal:sidebar-footer')
    await Bun.sleep(0)
    expect(registry.resolveEntries('sidebar_footer')).toEqual([])
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup()
    renderer.destroy()
  }
})

test('does not take over a footer that already has a competitor', async () => {
  const { renderer } = await createTestRenderer({ width: 80, height: 24 })
  const context = { theme: {} } as TuiSlotContext
  const registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, context)
  try {
    registry.register({ id: 'internal:sidebar-footer', order: 100, slots: { sidebar_footer: () => 'builtin' } })
    registry.register({ id: 'custom', order: 150, slots: { sidebar_footer: () => 'custom' } })
    expect(decorateFooter({
      slots: { register(plugin: TuiSlotPlugin) { registry.register({ ...plugin, id: 'pet' }); return 'pet' } },
      lifecycle: { signal: new AbortController().signal, onDispose: () => () => {} },
    }, original => original)).toBe(false)
    expect(registry.resolveEntries('sidebar_footer').map(entry => entry.id)).toEqual(['internal:sidebar-footer', 'custom'])
  } finally { renderer.destroy() }
})
