// Real installed host, controlled PTY and local SSE request injection only.
import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import { createSolidSlotRegistry } from '@opentui/solid'
import { rgbToHex, ScrollBoxRenderable, type Renderable, type EditBufferRenderable } from '@opentui/core'
import type { TuiPlugin, TuiPluginModule, TuiSlotMap, TuiSlotContext } from '@opencode-ai/plugin/tui'
import { catalog } from '../../src/art/catalog'
import { compose } from '../../src/art/compose'
import { assertSidebarFooter, sidebarFooterRows } from './sidebar-footer'

const tui: TuiPlugin = async (api, options) => {
  const directory = String(options?.artifacts)
  let registry!: ReturnType<typeof createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>>
  api.slots.register({ slots: {}, setup(ctx, renderer) { registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, ctx) } })
  const pause = (ms = 700) => Bun.sleep(ms)
  const nodes = (node: Renderable = api.renderer.root): Renderable[] => [node, ...node.getChildren().flatMap(child => nodes(child))]
  const find = (id: string) => nodes().find(node => node.id === id)
  const pets = () => nodes().filter(node => node.id.startsWith('jelly-pet-'))
  const observations: object[] = []
  let prompt: EditBufferRenderable | undefined
  let sequence = 0
  const publish = async (name: string, value: object) => {
    await Bun.write(`${directory}/${name}.tmp`, JSON.stringify(value))
    await rename(`${directory}/${name}.tmp`, `${directory}/${name}.json`)
  }
  const action = async (value: { input?: string; resize?: [number, number] }) => {
    const id = ++sequence
    await publish('pty-request', { id, ...value })
    for (let i = 0; i < 100; i++) {
      const file = Bun.file(`${directory}/pty-ack.json`)
      if (await file.exists() && (await file.json()).id === id) { await pause(); return }
      await pause(50)
    }
    throw new Error('PTY action timed out')
  }
  const inject = async (type: string, properties: object) => {
    await publish('inject', { id: ++sequence, event: { type, properties } })
    await pause(1000)
  }
  const capture = async (name: string, expected?: string) => {
    await pause()
    const buffer = api.renderer.currentRenderBuffer
    const text = new TextDecoder().decode(buffer.getRealCharBytes(true))
    const tree = nodes().map(node => ({ id: node.id, type: node instanceof ScrollBoxRenderable ? 'ScrollBox' : node.constructor.name, x: node.x, y: node.y,
      width: node.width, height: node.height, computedHeight: node.getLayoutNode().getComputedHeight(), visible: node.visible, parent: node.parent?.id }))
    await Bun.write(`${directory}/${name}.txt`, text)
    await Bun.write(`${directory}/${name}.json`, JSON.stringify({ width: api.renderer.width, height: api.renderer.height, lines: buffer.getSpanLines(), tree }, null, 2))
    if (expected !== undefined) assert.deepEqual(pets().map(pet => pet.id), expected ? [`jelly-pet-${expected}`] : [], `${name}: single active pet`)
    observations.push({ name, pets: pets().map(pet => pet.id), input: prompt && !prompt.isDestroyed ? prompt.plainText : undefined, focused: prompt?.focused,
      bounds: tree.filter(node => node.id.startsWith('jelly-') || node.type.includes('ScrollBox')) })
    return text
  }
  const run = async () => {
    for (let i = 0; i < 300 && !api.state.ready; i++) await pause(100)
    assert(api.state.ready)
    api.ui.dialog.clear()
    api.kv.set('dismissed_getting_started', true)
    api.kv.set('jelly-pet.enabled', true)
    api.kv.set('sidebar', 'auto')
    api.slots.register({ slots: {
      home_prompt_right: () => <text>HOME-RIGHT-PROBE</text>,
      session_prompt_right: () => <text>SESSION-RIGHT-PROBE</text>,
    } })
    assert((await capture('home', 'prompt')).includes('HOME-RIGHT-PROBE'), 'nested home right slot missing')
    const response = await api.client.session.create({ title: 'Task 4 native placement' })
    assert(response.data?.id)
    const sessionID = response.data.id
    api.route.navigate('session', { sessionID })
    await pause(1500)
    api.ui.dialog.clear()
    const sidebarText = await capture('sidebar', 'sidebar')
    assert(sidebarText.includes('SESSION-RIGHT-PROBE'), 'nested session right slot missing')
    api.kv.set('jelly-pet.enabled', false)
    const footer = sidebarFooterRows(await capture('sidebar-baseline', ''), api.renderer.width)
    api.kv.set('jelly-pet.enabled', true)
    await pause()
    assertSidebarFooter(sidebarText, api.renderer.width, footer)
    prompt = api.renderer.currentFocusedEditor ?? undefined
    assert(prompt)
    const stable = prompt
    await action({ input: '\x1b[200~unsent first line\nunsent second line\x1b[201~' })
    const draft = prompt.plainText
    assert.equal(draft, 'unsent first line\nunsent second line')
    const retained = () => {
      assert.equal(api.renderer.currentFocusedEditor, stable, 'Prompt editor identity/focus changed')
      assert.equal(prompt!.plainText, draft, 'draft changed')
      assert(prompt!.focused, 'focus lost')
    }
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    await capture('prompt', 'prompt')
    retained()
    api.kv.set('jelly-pet.enabled', false)
    await capture('disabled', '')
    retained()
    api.kv.set('jelly-pet.enabled', true)
    await capture('enabled', 'prompt')
    retained()
    const pet = find('jelly-pet-prompt')!
    const anchor = find('jelly-prompt-anchor')!
    assert.equal(pet.x + pet.width, anchor.x + anchor.width, 'visible-art union not right aligned')
    assert.equal(pet.y + 12, stable.y - 1, 'bottom pixel row not in blank padding immediately above input')
    // Independently index original art; inspect real native fg/bg half pixels.
    const frame = compose(catalog, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, options?.mood === 'thinking' ? 'thinking' : 'working', 0, false)
    const lines = api.renderer.currentRenderBuffer.getSpanLines().map(line => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: rgbToHex(span.fg), bg: rgbToHex(span.bg) }))))
    for (let y = 0; y < 26; y++) for (let x = 3; x <= 20; x++) {
      const color = y > 0 && y <= 24 ? frame.pixels[(y - 1) * 24 + x] : null
      const expected = color ?? rgbToHex(y >= 24 ? api.theme.current.backgroundElement : api.theme.current.background)
      const cell = lines[pet.y + Math.floor(y / 2)]![pet.x + x - 3]!
      assert.equal(y % 2 ? cell.bg : cell.fg, expected, `nested pixel ${x},${y}`)
    }
    await action({ resize: [100, 50] })
    await capture('narrow-prompt', 'prompt'); retained()
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    await capture('narrow-manual-sidebar', 'sidebar'); retained()
    const side = find('jelly-sidebar-anchor')!
    const sidePet = find('jelly-pet-sidebar')!
    assert.equal(sidePet.x, side.x)
    await action({ resize: [160, 50] })
    await capture('wide-again', 'sidebar'); retained()
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    await pause()
    prompt!.selectAll(); prompt!.deleteSelection()
    await action({ input: '@package.json' })
    const fileMenu = await capture('file-autocomplete', 'prompt')
    assert(fileMenu.includes('package.json'), 'file autocomplete missing')
    await action({ input: '\r' })
    const attached = prompt!.plainText
    assert(attached.includes('@package.json'), 'file selection did not insert attachment')
    await action({ resize: [110, 50] })
    await capture('attachment', 'prompt')
    assert.equal(prompt!.plainText, attached)
    assert.equal(api.renderer.currentFocusedEditor, stable)
    prompt!.selectAll(); prompt!.deleteSelection()
    await action({ input: '/he' })
    const autocomplete = await capture('autocomplete', 'prompt')
    assert(autocomplete.includes('/help'), 'slash autocomplete missing')
    await action({ input: '\x1b' })
    prompt!.selectAll(); prompt!.deleteSelection()
    await action({ input: `\x1b[200~${draft}\x1b[201~` })
    api.ui.dialog.replace(() => <api.ui.DialogAlert title="Placement dialog" message="Pet must be hidden" />)
    await capture('dialog', '')
    api.ui.dialog.clear()
    await pause()
    retained()
    await action({ resize: [28, 18] })
    await capture('tiny', '')
    assert.equal(prompt!.plainText, draft)
    await action({ resize: [110, 50] })
    await capture('recovered', 'prompt'); retained()
    prompt.selectAll(); prompt.deleteSelection()
    const tallDraft = Array.from({ length: 10 }, (_, i) => `draft row ${i}`).join('\n')
    // Public editor insertion avoids the host's intentional >3-line paste summary.
    prompt.insertText(tallDraft)
    await action({ resize: [110, 24] })
    await capture('tall-draft-small', '')
    await pause(1500)
    await capture('tall-draft-small-stable', '')
    assert.equal(api.renderer.currentFocusedEditor, stable)
    assert.equal(prompt.plainText, tallDraft)
    await action({ resize: [110, 50] })
    prompt.selectAll(); prompt.deleteSelection()
    await action({ input: `\x1b[200~${draft}\x1b[201~` })
    // Native host panels driven by synthetic SSE events, not synthetic JSX.
    await inject('permission.asked', { id: 'per_task4', sessionID, permission: 'bash', patterns: ['task4-no-execution'], always: [], metadata: { command: 'task4-no-execution' } })
    const permission = await capture('permission', 'waiting')
    assert(permission.includes('Permission'))
    assert(!find('jelly-prompt-anchor'), 'host unexpectedly retained prompt during request')
    const scroll = nodes().find(node => node instanceof ScrollBoxRenderable)!
    const panel = scroll.parent!.getChildren().find(node => node !== scroll && node.height > 0)!
    const waiting = find('jelly-waiting-anchor')!
    assert(panel && panel.y + panel.height <= waiting.y, 'waiting pet overlaps permission panel')
    await action({ resize: [110, 24] })
    await capture('permission-compact', 'waiting')
    await action({ resize: [110, 22] })
    await capture('permission-small', '')
    await action({ resize: [110, 50] })
    await capture('permission-recovered', 'waiting')
    await inject('permission.replied', { sessionID, requestID: 'per_task4', reply: 'reject' })
    await capture('permission-cleared', 'prompt')
    await inject('question.asked', { id: 'que_task4', sessionID, questions: [{ header: 'Placement', question: 'Is the panel clear?', options: [{ label: 'Yes', description: 'Fixture only' }] }] })
    const question = await capture('question', 'waiting')
    assert(question.includes('Is the panel clear?'))
    api.route.navigate('home')
    await capture('waiting-route-home', 'prompt')
    api.route.navigate('session', { sessionID })
    await capture('waiting-cold-entry', 'waiting')
    await action({ resize: [110, 24] })
    await capture('question-small', '')
    await action({ resize: [110, 50] })
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    await capture('question-sidebar', 'sidebar')
    await inject('question.rejected', { sessionID, requestID: 'que_task4' })
    await capture('question-cleared', 'sidebar')
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    const child = await api.client.session.create({ parentID: sessionID, title: 'Empty child request fixture' })
    assert(child.data?.id)
    // Supply the child snapshot alongside the synthetic request so the host's
    // parent aggregation has deterministic fixture state as well.
    // v1.18.30 Sync handles session.updated (not session.created).
    await inject('session.updated', { info: child.data })
    await publish('child-state', { response: child.data, state: api.state.session.get(child.data.id) })
    await inject('question.asked', { id: 'que_task4_child', sessionID: child.data.id, questions: [{ header: 'Child', question: 'Displayed child request?', options: [{ label: 'Yes', description: 'No agent dispatched' }] }] })
    assert((await capture('child-question', 'waiting')).includes('Displayed child request?'))
    await inject('question.rejected', { sessionID: child.data.id, requestID: 'que_task4_child' })
    await capture('child-question-cleared', 'prompt')
    await api.client.session.delete({ sessionID: child.data.id })
    await api.keymap.dispatchCommand('session.sidebar.toggle')
    await action({ resize: [160, 50] })
    const restoredFooter = await capture('footer-preserved', 'sidebar')
    assertSidebarFooter(restoredFooter, api.renderer.width, footer)
    const competitor = api.slots.register({ order: 0, slots: { sidebar_footer: () => <text>COMPETING FOOTER</text> } })
    const competing = await capture('competing-footer', 'prompt')
    assert(competing.includes('COMPETING FOOTER'))
    registry.unregister(competitor)
    const originalFooter = await capture('original-footer-restored', 'prompt')
    assertSidebarFooter(originalFooter, api.renderer.width, footer)
    api.route.register([{ name: 'task4-empty', render: () => <box><text>Other route</text></box> }])
    api.route.navigate('task4-empty')
    await capture('other-route', '')
    assert(await api.plugins.deactivate('opencode-pals'))
    api.route.navigate('home')
    await capture('disposed-home', '')
    assert.equal(api.state.provider.length, 0)
    assert.equal(api.state.session.messages(sessionID).length, 0)
    assert.equal(registry.getPluginErrors().length, 0)
    await api.client.session.delete({ sessionID })
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: true, version: api.app.version, bun: Bun.version,
      providerCount: api.state.provider.length, messageCount: 0, observations, slotErrors: registry.getPluginErrors(),
      limitations: ['Normal-font visual acceptance pending', 'Request events are synthetic local SSE; actual host panels and renderer are used', 'Host itself unmounts Prompt during requests; identity retention asserted only for layout/dialog transitions'] }, null, 2))
  }
  const timer = setTimeout(() => void run().catch(async error => {
    await capture('failure')
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, error: String(error), stack: error.stack, observations }, null, 2))
  }), 1000)
  api.lifecycle.onDispose(() => clearTimeout(timer))
}
export default { id: 'task4-native-smoke', tui } satisfies TuiPluginModule
