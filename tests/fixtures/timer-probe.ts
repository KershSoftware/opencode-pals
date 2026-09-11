import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

// Test-only instrumentation loaded before the production plugin. Count only
// timers whose allocation stack originates in our built artifact.
export const timerProbe = { intervals: new Set<unknown>(), deadlines: new Set<unknown>(), ticks: 0, layouts: 0, layoutObservers: new Set<unknown>(), errors: [] as unknown[][] }
export default { id: 'jelly-timer-probe', tui: async (api, options) => {
  const entry = String(options?.entry ?? '/dist/index.js')
  const original = { setInterval, setTimeout, clearInterval, clearTimeout }
  const logError = console.error
  console.error = (...args) => { timerProbe.errors.push(args); logError(...args) }
  api.lifecycle.onDispose(() => { console.error = logError })
  const layout = () => { timerProbe.layouts++ }
  api.renderer.addPostProcessFn(layout)
  api.lifecycle.onDispose(() => api.renderer.removePostProcessFn(layout))
  const addLayout = api.renderer.addPostProcessFn.bind(api.renderer)
  const removeLayout = api.renderer.removePostProcessFn.bind(api.renderer)
  api.renderer.addPostProcessFn = fn => { if (new Error().stack?.includes(entry)) timerProbe.layoutObservers.add(fn); addLayout(fn) }
  api.renderer.removePostProcessFn = fn => { timerProbe.layoutObservers.delete(fn); removeLayout(fn) }
  api.lifecycle.onDispose(() => { api.renderer.addPostProcessFn = addLayout; api.renderer.removePostProcessFn = removeLayout })
  globalThis.setInterval = ((fn: (...args: unknown[]) => void, ms: number, ...args: unknown[]) => {
    const ours = new Error().stack?.includes(entry)
    const handle = original.setInterval(() => { if (ours) timerProbe.ticks++; fn(...args) }, ms)
    if (ours) timerProbe.intervals.add(handle)
    return handle
  }) as typeof setInterval
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms: number, ...args: unknown[]) => {
    const ours = new Error().stack?.includes(entry)
    const handle = original.setTimeout(() => { timerProbe.deadlines.delete(handle); fn(...args) }, ms)
    if (ours) timerProbe.deadlines.add(handle)
    return handle
  }) as typeof setTimeout
  globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => { timerProbe.intervals.delete(handle); original.clearInterval(handle) }) as typeof clearInterval
  globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => { timerProbe.deadlines.delete(handle); original.clearTimeout(handle) }) as typeof clearTimeout
  api.lifecycle.onDispose(() => { Object.assign(globalThis, original) })
} } satisfies TuiPluginModule
