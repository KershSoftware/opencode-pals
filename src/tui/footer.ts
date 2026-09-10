import type { TuiPluginApi, TuiSlotPlugin, TuiSlotMap, TuiSlotContext } from '@opencode-ai/plugin/tui'
import { createSolidSlotRegistry } from '@opentui/solid'

type Footer = NonNullable<TuiSlotPlugin['slots']['sidebar_footer']>

export function decorateFooter(api: Pick<TuiPluginApi, 'slots' | 'lifecycle'>, decorate: (original: Footer) => Footer): boolean {
  let registry: ReturnType<typeof createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>> | undefined
  // The factory requires the EXACT host context, not a new { theme: api.theme }.
  // An empty scoped registration obtains it without reaching into host internals.
  api.slots.register({
    setup(ctx, renderer) { registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, ctx) },
    slots: {},
  })
  if (!registry) return false
  const host = registry
  const entries = host.resolveEntries('sidebar_footer')
  const original = entries[0]
  if (entries.length !== 1 || original?.id !== 'internal:sidebar-footer') return false
  const id = api.slots.register({ order: 99, slots: { sidebar_footer: decorate(original.renderer) } })
  // Fail closed on any competing contribution or replacement/removal of the
  // builtin. Unregister our own contribution; never disable somebody else's.
  // Reactivation is deliberately deferred to the next plugin load.
  let disposed = false
  let withdrawing = false
  const unsubscribe = host.subscribe(() => {
    if (disposed || withdrawing) return
    const rest = host.resolveEntries('sidebar_footer').filter(entry => entry.id !== id)
    if (rest.length === 1 && rest[0]?.id === original.id && rest[0]?.renderer === original.renderer) return
    withdrawing = true
    // A mounted 0.4.5 Slot samples the first change synchronously and drops
    // nested notifications. Two microtasks also cover our subscriber running
    // BEFORE the Slot queues its guard reset. Keep the entry until then so the
    // final unregister produces a real notification and disposes its Solid root.
    queueMicrotask(() => queueMicrotask(() => {
      if (!disposed && !api.lifecycle.signal.aborted) host.unregister(id)
    }))
  })
  api.lifecycle.onDispose(() => { disposed = true; unsubscribe() })
  return true
}
