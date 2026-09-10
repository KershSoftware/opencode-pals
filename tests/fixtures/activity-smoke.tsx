import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import type { TuiPlugin, TuiPluginModule, TuiSlotMap, TuiSlotContext } from '@opencode-ai/plugin/tui'
import type { AssistantMessage, Event, ToolPart } from '@opencode-ai/sdk/v2'
import { rgbToHex, type Renderable } from '@opentui/core'
import { catalog } from '../../src/art/catalog'
import { compose } from '../../src/art/compose'
import type { Mood } from '../../src/art/types'
import { user, assistant } from './sdk-data'
import { timerProbe } from './timer-probe'
import { createSolidSlotRegistry } from '@opentui/solid'
import { normalizePreferences, preferenceKey, type Preferences } from '../../src/state/preferences'

const tui: TuiPlugin = async (api, options) => {
  const directory = String(options?.artifacts)
  const preferences = (patch: Partial<Preferences>) => api.kv.set(preferenceKey, { ...normalizePreferences(api.kv.get(preferenceKey), catalog), ...patch })
  let registry!: ReturnType<typeof createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>>
  api.slots.register({ slots: {}, setup(ctx, renderer) { registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, ctx) } })
  const pause = (ms = 400) => Bun.sleep(ms)
  const nodes = (node: Renderable = api.renderer.root): Renderable[] => [node, ...node.getChildren().flatMap(nodes)]
  const observations: object[] = []
  const sessions: string[] = []
  let sequence = 0
  async function resize(width: number, height: number) {
    const id = ++sequence
    await Bun.write(`${directory}/pty-request.tmp`, JSON.stringify({ id, resize: [width, height] }))
    await rename(`${directory}/pty-request.tmp`, `${directory}/pty-request.json`)
    for (let i = 0; i < 100; i++) {
      const ack = Bun.file(`${directory}/pty-ack.json`)
      if (await ack.exists() && (await ack.json()).id === id) { await pause(); return }
      await pause(50)
    }
    throw new Error('PTY resize timed out')
  }
  async function inject(event: Event, ms = 400) {
    await Bun.write(`${directory}/inject.tmp`, JSON.stringify({ id: ++sequence, event }))
    await rename(`${directory}/inject.tmp`, `${directory}/inject.json`)
    await pause(ms)
  }
  async function capture(name: string, mood: Mood, perch?: string) {
    const pets = nodes().filter(n => n.id.startsWith('jelly-pet-'))
    assert.equal(pets.length, 1, `${name}: one pet`)
    const pet = pets[0]!
    if (perch) assert.equal(pet.id, `jelly-pet-${perch}`)
    const buffer = api.renderer.currentRenderBuffer
    const lines = buffer.getSpanLines()
    const rows = lines.map(line => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: rgbToHex(span.fg), bg: rgbToHex(span.bg) }))))
    const prompt = pet.id === 'jelly-pet-prompt'
    const sidebar = pet.id === 'jelly-pet-sidebar'
    const y = pet.y + (prompt ? 0 : 1)
    const frame = compose(catalog, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 0, false)
    const tree = nodes().map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }))
    await Bun.write(`${directory}/${name}.json`, JSON.stringify({ mood, lines, tree, width: api.renderer.width, height: api.renderer.height }, null, 2))
    await Bun.write(`${directory}/${name}.txt`, new TextDecoder().decode(buffer.getRealCharBytes(true)))
    const image = pet.getChildren()[0]!
    assert.equal(image.width, 14, `${name}: three-quarter native crop`)
    assert.equal(prompt || sidebar ? pet.height : pet.parent!.height, 9, `${name}: three-quarter reservation`)
    if (prompt) assert.equal(pet.y + 8, api.renderer.currentFocusedEditor!.y - 1, `${name}: nested above input`)
    if (sidebar) {
      const anchor = nodes().find(n => n.id === 'jelly-sidebar-anchor')!
      assert.equal(image.x, anchor.x, `${name}: left aligned`)
      const footer = anchor.getChildren().find(n => n !== pet)!
      // Source bottom y=15 lands in image row 7, including every static mood.
      const bottom = image.y + 7
      assert.equal(footer.y - bottom - 1, 1, `${name}: exactly one native blank row before project path`)
      assert(rows[bottom + 1]!.slice(anchor.x, anchor.x + anchor.width).every(c =>
        c.char.trim() === '' || c.fg === rgbToHex(api.theme.current.backgroundPanel) && c.bg === c.fg), `${name}: gap framebuffer is blank`)
    }
    for (let py = 0; py < (prompt ? 18 : 16); py++) for (let px = 2; px <= 15; px++) {
      const sy = py - (prompt ? 1 : 0)
      const pixel = sy >= 0 && sy < 16 ? frame.pixels[sy * 24 + px] : null
      const background = sidebar ? api.theme.current.backgroundPanel : prompt && py >= 16 ? api.theme.current.backgroundElement : api.theme.current.background
      const cell = rows[y + Math.floor(py / 2)]![pet.x + px - 2]!
      assert.equal(cell.char, '▀', `${name}: source ${px},${py}`)
      assert.equal(py % 2 ? cell.bg : cell.fg, pixel ?? rgbToHex(background), `${name}: ${mood} pixel ${px},${py}`)
    }
    observations.push({ name, mood, perch: pet.id, intervals: timerProbe.intervals.size, deadlines: timerProbe.deadlines.size })
  }
  async function run() {
    for (let i = 0; i < 300 && !api.state.ready; i++) await pause(100)
    assert.equal(api.app.version, '1.18.30')
    await pause(1800)
    api.ui.dialog.clear(); api.kv.set('dismissed_getting_started', true)
    api.kv.set('sidebar', 'auto')
    api.kv.set(preferenceKey, { ...normalizePreferences(undefined, catalog), animate: false })
    await pause(); await capture('home', 'idle', 'prompt')
    assert.equal(timerProbe.intervals.size, 0)
    const parent = (await api.client.session.create({ title: 'Task 6 controlled activity' })).data!
    sessions.push(parent.id); const sessionID = parent.id
    api.route.navigate('session', { sessionID }); await pause(1500); api.ui.dialog.clear()
    await capture('baseline', 'idle', 'sidebar')
    await resize(110, 50); await capture('paused-narrow', 'idle', 'prompt')
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    await capture('manual-narrow-sidebar', 'idle', 'sidebar')
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    await capture('manual-narrow-hidden', 'idle', 'prompt')
    await resize(110, 22)
    assert.equal(nodes().filter(n => n.id.startsWith('jelly-pet-')).length, 0)
    await Bun.write(`${directory}/small-height.json`, JSON.stringify({ width: api.renderer.width, height: api.renderer.height,
      petCount: 0, screen: new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true)) }, null, 2))
    await resize(28, 18); assert.equal(nodes().filter(n => n.id.startsWith('jelly-pet-')).length, 0)
    api.kv.set('sidebar', 'auto')
    await resize(160, 50); await capture('paused-resize-restored', 'idle', 'sidebar')
    const message = async (info: AssistantMessage | ReturnType<typeof user>, ms = 400) => inject({ id: `evt-${sequence + 1}`, type: 'message.updated', properties: { sessionID, info: { ...info, sessionID } } }, ms)
    const status = async (type: 'busy' | 'idle', ms = 400) => inject({ id: `evt-${sequence + 1}`, type: 'session.status', properties: { sessionID, status: { type } } }, ms)
    await message(user()); await status('busy'); await message(assistant())
    await capture('thinking', 'thinking')
    const tool: ToolPart = { id: 'prt_fixture', sessionID, messageID: 'assistant-1', type: 'tool', callID: 'call_fixture', tool: 'read', state: { status: 'running', input: { filePath: 'fixture-only' }, time: { start: 3 } } }
    await inject({ id: 'tool-running', type: 'message.part.updated', properties: { sessionID, part: tool, time: 3 } })
    await capture('tools', 'working')
    // Native removal exercises the same missing-user state as Sync's window
    // eviction; the exact 100-assistant replacement is covered in unit tests.
    await inject({ id: 'evict-user', type: 'message.removed', properties: { sessionID, messageID: 'user-1' } })
    assert(!api.state.session.messages(sessionID).some(m => m.id === 'user-1'))
    await capture('evicted-user-tools', 'working')
    await message({ ...assistant(), finish: 'tool-calls', time: { created: 2, completed: 4 } })
    await inject({ id: 'tool-done', type: 'message.part.updated', properties: { sessionID, time: 4, part: { ...tool, state: { status: 'completed', input: {}, output: 'Fixture only: no file read', title: 'fixture', metadata: {}, time: { start: 3, end: 4 } } } } })
    await message(assistant('assistant-2', 'user-1', 5)); await capture('thinking-again', 'thinking')
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause(); await capture('moving-perch', 'thinking', 'prompt')
    await message({ ...assistant('assistant-2', 'user-1', 5), finish: 'stop', time: { created: 5, completed: 6 } })
    await status('idle', 180); await capture('completion', 'done')
    assert.equal(timerProbe.deadlines.size, 1); await pause(1500); await capture('completion-expired', 'idle')
    assert.equal(timerProbe.deadlines.size, 0)
    preferences({ enabled: false }); await pause()
    assert.equal(nodes().filter(n => n.id.startsWith('jelly-pet-')).length, 0)
    preferences({ enabled: true }); await pause(); await capture('kv-reenabled-baseline', 'idle')
    await message(user('user-2', 10)); await status('busy'); await message(assistant('assistant-3', 'user-2', 11))
    await inject({ id: 'permission', type: 'permission.asked', properties: { id: 'per_fixture', sessionID, permission: 'read', patterns: ['fixture-only'], always: [], metadata: {} } })
    await capture('permission', 'waiting', 'waiting')
    await inject({ id: 'permission-clear', type: 'permission.replied', properties: { sessionID, requestID: 'per_fixture', reply: 'reject' } })
    await capture('permission-cleared', 'thinking', 'prompt')
    const child = (await api.client.session.create({ parentID: sessionID, title: 'Surfaced request fixture' })).data!
    sessions.push(child.id)
    await inject({ id: 'child', type: 'session.updated', properties: { sessionID: child.id, info: child } })
    await inject({ id: 'question', type: 'question.asked', properties: { id: 'que_fixture', sessionID: child.id, questions: [{ header: 'Fixture', question: 'Controlled child question?', options: [{ label: 'Yes', description: 'No execution' }] }] } })
    await capture('child-question', 'waiting', 'waiting')
    await inject({ id: 'controlled-error', type: 'session.error', properties: { sessionID, error: { name: 'APIError', data: { message: 'Controlled local fixture', isRetryable: false, statusCode: 500 } } } })
    await capture('deferred-error', 'waiting')
    await inject({ id: 'question-clear', type: 'question.rejected', properties: { sessionID: child.id, requestID: 'que_fixture' } })
    await capture('error', 'error')
    await status('busy'); await capture('duplicate-busy', 'error')
    await inject({ id: 'retry', type: 'session.status', properties: { sessionID, status: { type: 'retry', attempt: 1, message: 'Controlled retry', next: Date.now() + 1000 } } })
    await capture('retry', 'error')
    await status('busy'); await capture('recovery', 'thinking')
    // The reviewed controller consumes one terminal effect per user turn.
    // Interrupt a fresh turn rather than contradict the consumed error above.
    await message(user('user-interrupt', 15)); await message(assistant('assistant-interrupt', 'user-interrupt', 16))
    await inject({ id: 'interrupt', type: 'session.error', properties: { sessionID, error: { name: 'MessageAbortedError', data: { message: 'Controlled interrupt' } } } }, 180)
    await capture('interrupt', 'interrupted'); await status('idle'); await pause(700); await capture('interrupt-expired', 'idle')
    const other = (await api.client.session.create({ title: 'Navigation baseline fixture' })).data!
    sessions.push(other.id)
    api.route.navigate('session', { sessionID: other.id }); await pause(800); await capture('other-session', 'idle')
    api.route.navigate('session', { sessionID }); await pause(800); await capture('return-baseline', 'idle')
    const duplicateError: Event = { id: 'controlled-error', type: 'session.error', properties: { sessionID, error: { name: 'APIError', data: { message: 'Controlled local fixture', isRetryable: false, statusCode: 500 } } } }
    const duplicateAbort: Event = { id: 'interrupt', type: 'session.error', properties: { sessionID, error: { name: 'MessageAbortedError', data: { message: 'Controlled interrupt' } } } }
    await inject(duplicateError); await capture('route-duplicate-error', 'idle')
    await inject(duplicateAbort, 180); await capture('route-duplicate-abort', 'idle')
    preferences({ enabled: false }); await pause()
    preferences({ enabled: true }); await pause()
    await inject(duplicateError); await capture('reenable-duplicate-error', 'idle')
    await inject(duplicateAbort, 180); await capture('reenable-duplicate-abort', 'idle')
    assert.equal(timerProbe.deadlines.size, 0)
    api.route.navigate('home'); await pause(); await capture('return-home', 'idle', 'prompt')
    preferences({ animate: true }); await pause(350)
    assert.equal(timerProbe.intervals.size, 1)
    const before = timerProbe.ticks; await pause(1000); const ticks = timerProbe.ticks - before
    assert(ticks >= 9 && ticks <= 11, `clock tick count ${ticks}`)
    preferences({ animate: false }); await pause(); assert.equal(timerProbe.intervals.size, 0)
    api.route.navigate('session', { sessionID }); await pause()
    await message(user('user-3', 20)); await status('busy'); await message(assistant('assistant-4', 'user-3', 21))
    await message({ ...assistant('assistant-4', 'user-3', 21), finish: 'stop', time: { created: 21, completed: 22 } }); await status('idle', 180)
    assert.equal(timerProbe.deadlines.size, 1)
    await api.plugins.deactivate('opencode-pals'); await pause()
    assert.equal(timerProbe.deadlines.size, 0); assert.equal(timerProbe.intervals.size, 0)
    assert.equal(timerProbe.layoutObservers.size, 0)
    assert.equal(nodes().filter(n => n.id.startsWith('jelly-pet-')).length, 0)
    assert(await api.plugins.activate('opencode-pals')); await pause(1200)
    const immediateReactivationVisible = nodes().some(n => n.id.startsWith('jelly-pet-'))
    await Bun.write(`${directory}/reactivation-before-remount.json`, JSON.stringify({ immediateReactivationVisible,
      plugins: api.plugins.list(), slotErrors: registry.getPluginErrors(),
      slots: Object.fromEntries(['home_prompt', 'session_prompt', 'sidebar_footer', 'app_bottom'].map(name =>
        [name, registry.resolveEntries(name as keyof TuiSlotMap).map(e => e.id)])),
      layoutObservers: timerProbe.layoutObservers.size,
      tree: nodes().map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, visible: n.visible })),
      screen: new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true)) }, null, 2))
    assert(immediateReactivationVisible, 'reactivation must update mounted host slots without a route remount')
    await capture('reactivated-immediate-prompt', 'idle', 'prompt')
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    await api.plugins.deactivate('opencode-pals'); await pause()
    assert.equal(timerProbe.layoutObservers.size, 0)
    assert(await api.plugins.activate('opencode-pals')); await pause()
    await capture('reactivated-immediate-sidebar', 'idle', 'sidebar')
    api.route.navigate('home'); await pause()
    await api.plugins.deactivate('opencode-pals'); await pause()
    assert.equal(timerProbe.layoutObservers.size, 0)
    assert(await api.plugins.activate('opencode-pals')); await pause()
    await capture('reactivated-immediate-home', 'idle', 'prompt')
    api.route.navigate('session', { sessionID }); await pause(800)
    await capture('reactivated-baseline', 'idle')
    assert.equal(timerProbe.layoutObservers.size, 1)
    const providers = (await api.client.provider.list()).data!
    assert.equal(providers.all.length, 0)
    for (const id of sessions) assert.equal((await api.client.session.messages({ sessionID: id })).data!.length, 0)
    for (const id of [...sessions].reverse()) await api.client.session.delete({ sessionID: id })
    assert.equal(registry.getPluginErrors().length, 0)
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: true, version: api.app.version, providerCount: 0, persistedMessageCount: 0, modelCalls: 0, ticks, lifecycleCleanup: true, immediateReactivationVisible, slotErrors: registry.getPluginErrors(), observations }, null, 2))
  }
  void run().catch(async error => {
    await Bun.write(`${directory}/failure.json`, JSON.stringify({ entries: registry.resolveEntries('session_prompt').map(e => e.id), slotErrors: registry.getPluginErrors(), errors: timerProbe.errors, layouts: timerProbe.layouts, plugins: api.plugins.list(), tree: nodes().map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, visible: n.visible, parent: n.parent?.id })), screen: new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true)) }, null, 2))
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, error: String(error), stack: error.stack, observations }, null, 2))
  })
}
export default { id: 'jelly-activity-smoke', tui } satisfies TuiPluginModule
