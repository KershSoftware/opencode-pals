import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui'
import { rgbToHex, type Renderable } from '@opentui/core'
import { normalizePreferences, preferenceKey, selectedAppearance } from '../../src/state/preferences'
import { catalog } from '../../src/art/catalog'
import { compose } from '../../src/art/compose'
import { timerProbe } from './timer-probe'

const tui: TuiPlugin = async (api, options) => {
  const directory = String(options?.artifacts)
  const phase = options?.restart ? 'restart' : 'configure'
  const pause = (ms = 500) => Bun.sleep(ms)
  const nodes = (node: Renderable = api.renderer.root): Renderable[] => [node, ...node.getChildren().flatMap(nodes)]
  const pets = () => nodes().filter(n => n.id.startsWith('jelly-pet-'))
  const get = () => normalizePreferences(api.kv.get(preferenceKey), catalog)
  const screen = () => new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true))
  const observations: object[] = []
  let sequence = 0
  async function input(input: string) {
    const id = ++sequence
    await Bun.write(`${directory}/pty-request.tmp`, JSON.stringify({ id, input }))
    await rename(`${directory}/pty-request.tmp`, `${directory}/pty-request.json`)
    for (let i = 0; i < 100; i++) {
      const ack = Bun.file(`${directory}/pty-ack.json`)
      if (await ack.exists() && (await ack.json()).id === id) { await pause(); return }
      await pause(50)
    }
    throw new Error('PTY input timed out')
  }
  async function capture(name: string) {
    await Bun.write(`${directory}/${phase}-${name}.txt`, screen())
    await Bun.write(`${directory}/${phase}-${name}.json`, JSON.stringify({ lines: api.renderer.currentRenderBuffer.getSpanLines(),
      preferences: get(), pets: pets().map(n => ({ id: n.id, x: n.x, y: n.y })), intervals: timerProbe.intervals.size }, null, 2))
    observations.push({ name, preferences: get(), pets: pets().length, intervals: timerProbe.intervals.size })
  }
  async function run() {
    for (let i = 0; i < 300 && (!api.state.ready || !api.kv.ready); i++) await pause(100)
    await pause(1800); api.ui.dialog.clear(); api.kv.set('dismissed_getting_started', true); await pause()
    assert.equal(api.app.version, '1.18.30')
    if (options?.restart) {
      assert.equal(get().enabled, false); assert.equal(get().animate, false)
      assert.equal(selectedAppearance(get()).hat, 'none')
      assert.equal(pets().length, 0); assert.equal(timerProbe.intervals.size, 0)
      await capture('saved-on-load')
    } else {
      api.kv.set(preferenceKey, normalizePreferences(undefined, catalog))
      api.kv.set('animations_enabled', true); await pause()
    }
    const prompt = api.renderer.currentFocusedEditor!
    assert(prompt)
    const draft = 'unsent first line\nunsent second line'
    await input(`\x1b[200~${draft}\x1b[201~`)
    const retained = () => {
      assert.equal(api.renderer.currentFocusedEditor, prompt)
      assert.equal(prompt.plainText, draft); assert(prompt.focused); assert(!prompt.isDestroyed)
    }
    const open = async () => {
      prompt.cursorOffset = 0
      await input('/pals')
      await capture('autocomplete')
      assert(screen().includes('/pals'), 'real slash autocomplete')
      await input('\r')
      assert(api.ui.dialog.open); assert(screen().includes('Pals settings'))
      assert.equal(prompt.plainText, draft)
      await capture('menu')
    }
    const choose = async (filter: string) => { await input(filter); await input('\r') }
    assert((await api.keymap.dispatchCommand('command.palette.show')).ok)
    await pause(); await choose('Pals settings')
    assert(screen().includes('Pals settings')); assert(api.ui.dialog.open)
    await capture('palette-menu'); await input('\x1b'); retained()
    if (options?.restart) {
      await open(); await choose('Show Pal'); retained()
      assert.equal(pets().length, 1); assert.equal(timerProbe.intervals.size, 0)
      await capture('shown-after-restart')
    } else {
      await open(); assert(screen().includes('Only one skin available'))
      await choose('Character:'); assert(screen().includes('Jelly')); await input('\r'); retained()
      await open(); await choose('Skin:'); assert(screen().includes('Sky blue')); await input('\r'); retained()
      if (catalog.characters.some(c => c.id === 'sprout')) {
        await open(); await choose('Character:'); assert(screen().includes('Test sprout'))
        await choose('Test sprout'); retained(); assert.equal(get().character, 'sprout')
        await open(); await choose('Skin:'); assert(screen().includes('Green')); assert(screen().includes('Gold'))
        await choose('Gold'); retained(); assert.equal(selectedAppearance(get()).skin, 'gold')
        assert.equal(selectedAppearance(get()).hat, 'none'); assert.equal(pets().length, 1)
        await capture('test-sprout-gold')
        await open(); await choose('Character:'); await choose('Jelly'); retained()
      }
      await open(); await choose('Hat:'); await choose('None'); retained()
      assert.equal(selectedAppearance(get()).hat, 'none'); await capture('bare')
      await open(); await choose('Hide Pal'); retained()
      assert.equal(pets().length, 0); assert.equal(timerProbe.intervals.size, 0); await capture('hidden')
      await open(); await choose('Show Pal'); retained(); assert.equal(pets().length, 1)
      await open(); await choose('Pause Pal'); retained()
      assert.equal(get().animate, false); assert.equal(timerProbe.intervals.size, 0); await capture('paused')
      await open(); await choose('Reset appearance'); retained()
      assert.equal(selectedAppearance(get()).hat, 'lavender-bucket'); assert.equal(get().enabled, true); assert.equal(get().animate, false)
      await open(); await choose('Hat:'); await choose('None'); retained()
      // Verify actual paused bare pixels against the shared art contract.
      const pet = pets()[0]!
      const frame = compose(catalog, selectedAppearance(get()), 'idle', 0, false)
      const rows = api.renderer.currentRenderBuffer.getSpanLines().map(l => l.spans.flatMap(s => [...s.text].map(char => ({ char, fg: rgbToHex(s.fg), bg: rgbToHex(s.bg) }))))
      for (let y = 0; y < 18; y++) for (let x = 2; x <= 15; x++) {
        const pixel = y > 0 && y <= 16 ? frame.pixels[(y - 1) * 24 + x] : null
        const cell = rows[pet.y + Math.floor(y / 2)]![pet.x + x - 2]!
        assert.equal(y % 2 ? cell.bg : cell.fg, pixel ?? rgbToHex(y >= 16 ? api.theme.current.backgroundElement : api.theme.current.background))
      }
      api.kv.set('animations_enabled', false)
      await open(); await choose('Animate Pal'); retained(); assert.equal(timerProbe.intervals.size, 0)
      api.kv.set('animations_enabled', true); await pause(); assert.equal(timerProbe.intervals.size, 1)
      await open(); await choose('Pause Pal'); retained()
      await open(); await choose('Hide Pal'); retained(); await capture('saved-hidden-bare-paused')
    }
    const providers = (await api.client.provider.list()).data!
    assert.equal(providers.all.length, 0)
    await pause(1500)
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: true, version: api.app.version, phase,
      draftPreserved: true, promptIdentityPreserved: true, focusPreserved: true, providerCount: 0,
      plugins: api.plugins.list(), observations }, null, 2))
  }
  void run().catch(async error => {
    await Bun.write(`${directory}/failure.txt`, screen())
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, phase, error: String(error), stack: error.stack, observations }, null, 2))
  })
}
export default { id: 'jelly-preferences-smoke', tui } satisfies TuiPluginModule
