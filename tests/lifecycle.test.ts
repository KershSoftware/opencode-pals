import { expect, spyOn, test } from 'bun:test'
import { createFrameClock } from '../src/tui/pet-view'
import { createPetAnimator } from '../src/tui/animation'
import type { Activity } from '../src/state/mood'
import type { Frame } from '../src/art/types'
import { compose } from '../src/art/compose'
import { catalog } from '../src/art/catalog'
import { sessionHost, user } from './fixtures/session-host'
import { watchActivity } from '../src/tui/session'
import { createComputed, createRoot } from 'solid-js'
import { normalizePreferences, preferenceKey, selectedAppearance } from '../src/state/preferences'

function timers(run: (t: { advance(ms: number): void; intervals(): number; deadlines(): number }) => void) {
  let now = 0; let id = 0
  const jobs = new Map<number, { at: number; every: number; fn: () => void }>()
  const spies = [spyOn(performance, 'now').mockImplementation(() => now),
    spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number) => { jobs.set(++id, { at: now + ms, every: ms, fn }); return id }) as never),
    spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms: number) => { jobs.set(++id, { at: now + ms, every: 0, fn }); return id }) as never),
    spyOn(globalThis, 'clearInterval').mockImplementation(((id: number) => { jobs.delete(id) }) as never),
    spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => { jobs.delete(id) }) as never)]
  try { run({ advance(ms) { const end = now + ms; while (true) { const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; if (next[1].every) next[1].at += next[1].every; else jobs.delete(next[0]); next[1].fn() } now = end }, intervals: () => [...jobs.values()].filter(j => j.every).length, deadlines: () => [...jobs.values()].filter(j => !j.every).length }) } finally { spies.forEach(s => s.mockRestore()) }
}
const appearance = { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }
const activity: Activity = { sessionID: 's', turnID: 'u', observedLive: true, busy: true, retry: false, waiting: false, runningTools: [], outcome: null }
test('namespaced hide/show reconciles baseline without replaying completion/error and disposes subscriptions', () => timers(t => {
  const h = sessionHost([user()]); const frames: Frame[] = []
  const pet = createPetAnimator(f => frames.push(f))
  const dispose = createRoot(dispose => {
    createComputed(() => {
      const p = normalizePreferences(h.api.kv.get(preferenceKey), catalog)
      pet.configure(selectedAppearance(p), p.animate, p.enabled)
    })
    return dispose
  })
  const stop = watchActivity(h.api, pet.update)
  h.set('statuses', 'parent', { type: 'busy' }); t.advance(250)
  const event = { id: 'old-error', type: 'session.error' as const, properties: { sessionID: 'parent', error: { name: 'UnknownError' as const, data: { message: 'controlled' } } } }
  h.send(event)
  h.set('enabled', false); h.set('statuses', 'parent', { type: 'idle' })
  const hiddenEvent = { ...event, id: 'error-delivered-while-hidden' }
  h.send(hiddenEvent)
  const hidden = frames.length; t.advance(2000)
  expect(frames.length).toBe(hidden); expect(t.intervals()).toBe(0); expect(t.deadlines()).toBe(0)
  h.set('enabled', true); h.send(event); h.send(hiddenEvent)
  expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'idle', 0, false))
  expect(t.deadlines()).toBe(0)
  stop(); dispose(); pet.dispose(); expect(h.listeners()).toBe(0)
}))
test('R2: duplicate abort after a baseline creates no pixels or deadline; fresh abort and disposal still work', () => timers(t => {
  const h = sessionHost([user()]); const frames: Frame[] = []
  const pet = createPetAnimator(f => frames.push(f))
  pet.configure(appearance, false, true)
  const stop = watchActivity(h.api, pet.update)
  const event = { id: 'same-abort', type: 'session.error' as const, properties: { sessionID: 'parent', error: { name: 'MessageAbortedError' as const, data: { message: 'controlled' } } } }
  h.send(event); expect(t.deadlines()).toBe(1)
  h.set('route', ''); h.set('route', 'parent')
  expect(t.deadlines()).toBe(0)
  const before = frames.length
  h.send(event); t.advance(1000)
  expect(t.deadlines()).toBe(0); expect(t.intervals()).toBe(0); expect(frames.length).toBe(before)
  h.send({ ...event, id: 'new-abort' }); expect(t.deadlines()).toBe(1)
  stop(); pet.dispose()
  expect(h.listeners()).toBe(0); expect(t.deadlines()).toBe(0)
  const disposedFrames = frames.length
  h.send({ ...event, id: 'after-disposal' }); h.set('route', ''); t.advance(2000)
  expect(frames.length).toBe(disposedFrames)
}))
test('clock activation is idempotent, bounded at 10Hz, and disposal prevents restart/ticks', () => timers(t => {
  let ticks = 0; const clock = createFrameClock(() => ticks++)
  clock.setActive(true); clock.setActive(true); expect(t.intervals()).toBe(1)
  t.advance(1000); expect(ticks).toBe(10)
  clock.setActive(false); expect(t.intervals()).toBe(0)
  t.advance(1000); expect(ticks).toBe(10)
  clock.setActive(true); clock.dispose(); clock.dispose(); clock.setActive(true)
  t.advance(1000); expect(ticks).toBe(10); expect(t.intervals()).toBe(0)
}))
test('paused controller deadlines resolve hysteresis/done without intervals and suppress equal pixels', () => timers(t => {
  const frames: Frame[] = []; const pet = createPetAnimator(f => frames.push(f))
  pet.configure(appearance, false, true); pet.update(activity)
  expect(t.intervals()).toBe(0); expect(t.deadlines()).toBe(1)
  t.advance(250); expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'thinking', 0, false))
  const before = frames.length; pet.update(activity); t.advance(1000); expect(frames.length).toBe(before)
  pet.update({ ...activity, busy: false, outcome: 'success' })
  expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'done', 0, false)); expect(t.deadlines()).toBe(1)
  t.advance(1400); expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'idle', 0, false)); expect(t.deadlines()).toBe(0)
  pet.dispose()
}))
test('switch, superseding waiting, disable and disposal cancel paused deadlines', () => timers(t => {
  const frames: Frame[] = []; const pet = createPetAnimator(f => frames.push(f))
  pet.configure(appearance, false, true); pet.update(activity)
  pet.update({ ...activity, waiting: true }); expect(t.deadlines()).toBe(0)
  pet.update({ ...activity, waiting: false }); expect(t.deadlines()).toBe(1)
  pet.update({ ...activity, sessionID: 'other', turnID: null, busy: false, observedLive: false }); expect(t.deadlines()).toBe(0)
  pet.update({ ...activity, outcome: 'aborted' }); expect(t.deadlines()).toBe(1)
  pet.configure(appearance, false, false); expect(t.deadlines()).toBe(0)
  pet.configure(appearance, true, true); expect(t.intervals()).toBe(1)
  pet.configure(appearance, true, true); expect(t.intervals()).toBe(1)
  pet.dispose(); const before = frames.length; pet.update(activity); pet.configure(appearance, true, true); t.advance(3000)
  expect(frames.length).toBe(before); expect(t.deadlines()).toBe(0); expect(t.intervals()).toBe(0)
}))

test('animated frames use mood-relative time and skip unchanged ticks', () => timers(t => {
  t.advance(10000)
  const frames: Frame[] = []; const pet = createPetAnimator(f => frames.push(f))
  pet.configure(appearance, true, true); pet.update(activity)
  t.advance(300)
  const before = frames.length
  t.advance(1000)
  expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'thinking', 1050, true))
  expect(frames.length).toBe(before)
  t.advance(100)
  expect(frames.at(-1)).toEqual(compose(catalog, appearance, 'thinking', 1150, true))
  expect(frames.length).toBe(before + 1)
  pet.dispose()
}))
