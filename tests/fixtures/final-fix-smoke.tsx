import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import { createSolidSlotRegistry } from '@opentui/solid'
import { rgbToHex, type Renderable } from '@opentui/core'
import type { TuiPlugin, TuiPluginModule, TuiSlotMap, TuiSlotContext } from '@opencode-ai/plugin/tui'
import { finalFixCatalog as catalog } from './final-fix-catalog'
import { compose } from '../../src/art/compose'
import { normalizePreferences, preferenceKey } from '../../src/state/preferences'

const tui: TuiPlugin = async (api, options) => {
  const directory = String(options?.artifacts)
  let registry!: ReturnType<typeof createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>>
  api.slots.register({ slots: {}, setup(ctx, renderer) { registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, ctx) } })
  const pause = () => Bun.sleep(500)
  const nodes = (node: Renderable = api.renderer.root): Renderable[] => [node, ...node.getChildren().flatMap(nodes)]
  const observations: object[] = []
  let sequence = 0
  let sessionID = ''
  const inject = async (type: string, properties: object) => {
    await Bun.write(`${directory}/inject.tmp`, JSON.stringify({ id: ++sequence, event: { type, properties } }))
    await rename(`${directory}/inject.tmp`, `${directory}/inject.json`); await pause()
  }
  const select = async (character: string) => {
    api.kv.set(preferenceKey, { ...normalizePreferences(api.kv.get(preferenceKey), catalog), character, animate: false })
    await pause()
  }
  async function capture(name: string, character: string, perch: 'prompt' | 'sidebar' | 'waiting') {
    const all = nodes(); const pets = all.filter(n => n.id.startsWith('jelly-pet-'))
    assert.equal(pets.length, 1, `${name}: one pet`)
    const pet = pets[0]!; assert.equal(pet.id, `jelly-pet-${perch}`)
    const definition = catalog.characters.find(c => c.id === character)!
    // Independently hand-derived crop/clearance values, not adapter output.
    const [sourceX, sourceY, width, pixelHeight, perchRows] = character === 'jelly' ? [2, 0, 14, 16, 9]
      : character === 'sprout' ? [10, 10, 4, 10, 6] : [0, -2, 23, 26, 14]
    const image = pet.getChildren()[0]!
    assert.equal(image.width, width)
    assert.equal(perch === 'waiting' ? pet.parent!.height : pet.height, perchRows)
    if (perch === 'sidebar') assert.equal(image.x, all.find(n => n.id === 'jelly-sidebar-anchor')!.x)
    else assert.equal(image.x + image.width, pet.parent!.x + pet.parent!.width)
    if (perch === 'prompt') {
      const editor = api.renderer.currentFocusedEditor!
      assert(editor); assert.equal(pet.y + pixelHeight! / 2, editor.y - 1, 'only blank prompt padding is overlapped')
    }
    const mood = perch === 'waiting' ? 'waiting' : 'idle'
    const frame = compose(catalog, { character, ...definition.defaults }, mood, 0, false)
    const palette = new Set(frame.pixels.filter(Boolean))
    const buffer = api.renderer.currentRenderBuffer
    const lines = buffer.getSpanLines()
    const rows = lines.map(line => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: rgbToHex(span.fg), bg: rgbToHex(span.bg) }))))
    const y = pet.y + (perch === 'prompt' ? 0 : 1)
    for (let py = 0; py < pixelHeight! + (perch === 'prompt' ? 2 : 0); py++) for (let px = 0; px < width!; px++) {
      const sy = sourceY! + py - (perch === 'prompt' ? 1 : 0)
      const pixel = sy >= 0 && sy < 24 ? frame.pixels[sy * 24 + sourceX! + px] : null
      const background = perch === 'sidebar' ? api.theme.current.backgroundPanel
        : perch === 'prompt' && py >= pixelHeight! ? api.theme.current.backgroundElement : api.theme.current.background
      const cell = rows[y + Math.floor(py / 2)]![image.x + px]!
      assert.equal(cell.char, '▀', `${name}: missing half-block`)
      assert.equal(py % 2 ? cell.bg : cell.fg, pixel ?? rgbToHex(background), `${name}: ${px},${py}`)
    }
    const visible = rows.flat().filter(cell => cell.char === '▀').reduce((n, cell) => n + Number(palette.has(cell.fg)) + Number(palette.has(cell.bg)), 0)
    assert.equal(visible, frame.pixels.filter(Boolean).length, `${name}: clipped/duplicate art`)
    const tree = all.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }))
    await Bun.write(`${directory}/${name}.json`, JSON.stringify({ lines, tree }, null, 2))
    observations.push({ name, character, perch, visible, width, perchRows })
  }
  async function run() {
    for (let i = 0; i < 300 && !api.state.ready; i++) await Bun.sleep(100)
    assert.equal(api.app.version, '1.18.30')
    await Bun.sleep(1500)
    api.ui.dialog.clear(); api.kv.set('dismissed_getting_started', true); api.kv.set('sidebar', 'auto')
    api.kv.set(preferenceKey, { ...normalizePreferences(undefined, catalog), animate: false })
    for (const character of ['jelly', 'sprout', 'edge', 'jelly']) {
      await select(character); await capture(`home-${character}`, character, 'prompt')
    }
    sessionID = (await api.client.session.create({ title: 'Final review native regression' })).data!.id
    api.route.navigate('session', { sessionID }); await Bun.sleep(1500); api.ui.dialog.clear()
    const editor = api.renderer.currentFocusedEditor!
    editor.insertText('retained review draft')
    for (const character of ['jelly', 'sprout', 'edge', 'jelly']) {
      await select(character); await capture(`sidebar-${character}`, character, 'sidebar')
      await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
      await capture(`prompt-${character}`, character, 'prompt')
      assert.equal(api.renderer.currentFocusedEditor, editor); assert.equal(editor.plainText, 'retained review draft')
      await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    }
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    await inject('question.asked', { id: 'final-question', sessionID, questions: [{ header: 'Review', question: 'Request panel remains clear?', options: [{ label: 'Yes', description: 'Fixture only' }] }] })
    for (const character of ['jelly', 'sprout', 'edge', 'jelly']) {
      await select(character); await capture(`waiting-${character}`, character, 'waiting')
      assert(new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true)).includes('Request panel remains clear?'))
    }
    await inject('question.rejected', { sessionID, requestID: 'final-question' })
    await api.keymap.dispatchCommand('session.sidebar.toggle'); await pause()
    const builtin = registry.resolveEntries('sidebar_footer').find(e => e.id === 'internal:sidebar-footer')!
    assert(builtin)
    registry.unregister(builtin.id); await pause()
    await capture('builtin-removed-fallback', 'jelly', 'prompt')
    assert(!nodes().some(n => n.id === 'jelly-sidebar-anchor'), 'stale footer component still mounted')
    registry.register({ id: builtin.id, order: 100, slots: { sidebar_footer: () => <text>REPLACEMENT FOOTER</text> } }); await pause()
    await capture('builtin-replaced-fallback', 'jelly', 'prompt')
    assert(new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true)).includes('REPLACEMENT FOOTER'))
    registry.unregister(builtin.id); await pause()
    registry.register({ id: builtin.id, order: 100, slots: { sidebar_footer: builtin.renderer } }); await pause()
    assert(await api.plugins.deactivate('opencode-pals')); await pause()
    assert(await api.plugins.activate('opencode-pals')); await pause()
    await capture('reactivated-sidebar', 'jelly', 'sidebar')
    const competitor = api.slots.register({ order: 150, slots: { sidebar_footer: () => <text>LOW PRIORITY FOOTER</text> } }); await pause()
    await capture('low-priority-competitor-fallback', 'jelly', 'prompt')
    assert(!nodes().some(n => n.id === 'jelly-sidebar-anchor'))
    registry.unregister(competitor); await pause()
    await capture('competitor-removed-still-fallback', 'jelly', 'prompt')
    assert.equal(api.state.provider.length, 0); assert.equal(api.state.session.messages(sessionID).length, 0)
    assert.equal(registry.getPluginErrors().length, 0)
    await api.client.session.delete({ sessionID })
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: true, version: api.app.version, providerCount: 0, messageCount: 0,
      observations, slotErrors: [], footerWithdrawal: true, catalogGeometry: true }, null, 2))
  }
  const timer = setTimeout(() => void run().catch(async error => {
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, error: String(error), stack: error.stack, observations }, null, 2))
  }), 1000)
  api.lifecycle.onDispose(() => clearTimeout(timer))
}
export default { id: 'final-fix-native-smoke', tui } satisfies TuiPluginModule
