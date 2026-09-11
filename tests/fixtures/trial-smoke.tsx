// Native acceptance for a prepared one-off entry, using the installed host's APIs.
import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import type { Renderable, TuiPluginModule } from '@opencode-ai/plugin/tui'
import { rgbToHex } from '@opentui/core'
import { preferenceKey, type Preferences } from '../../src/state/preferences'
import { usesDemonstrationOracle } from './trial-oracle'

export default { id: 'pals-trial-smoke', async tui(api, options) {
  const directory = String(options?.artifacts)
  const trial = options?.trial as { character: string; characterName: string; bounds: { width: number }; source?: string; sourceHash?: string }
  const pause = (ms = 500) => Bun.sleep(ms)
  const screen = () => new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true))
  const nodes = (node: Renderable = api.renderer.root): Renderable[] => [node, ...node.getChildren().flatMap(nodes)]
  const get = () => api.kv.get<Preferences>(preferenceKey)!
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
    throw new Error('Trial PTY input timed out')
  }
  const choose = async (filter: string) => { await input(filter); await input('\r') }
  async function capture(name: string, perch: string) {
    await pause()
    const pets = nodes().filter(n => n.id.startsWith('jelly-pet-'))
    assert.equal(pets.length, 1, `${name}: exactly one Pal`)
    const pet = pets[0]!; assert.equal(pet.id, `jelly-pet-${perch}`)
    assert.equal(pet.getChildren()[0]!.width, trial.bounds.width)
    assert.equal(get().character, trial.character)
    const lines = api.renderer.currentRenderBuffer.getSpanLines()
    const colors = lines.flatMap(l => l.spans.flatMap(s => [...s.text].filter(c => c === '▀').flatMap(() => [rgbToHex(s.fg), rgbToHex(s.bg)])))
    // Independent pixel/geometry oracle for the checked-in demonstration candidate.
    if (usesDemonstrationOracle(trial)) {
      assert.equal(pet.getChildren()[0]!.width, 4); assert.equal(pet.height, 7)
      assert.equal(colors.filter(c => c === '#00aa44').length, name.includes('error') ? 26 : 28)
      assert.equal(colors.filter(c => c === '#ffcc00').length, name.includes('error') ? 2 : 0)
    }
    await Bun.write(`${directory}/${name}.json`, JSON.stringify({ lines,
      tree: nodes().map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })), preferences: get() }, null, 2))
    await Bun.write(`${directory}/${name}.txt`, screen())
    observations.push({ name, character: get().character, width: pet.width, height: pet.height, perch })
  }
  async function run() {
    for (let i = 0; i < 300 && (!api.state.ready || !api.kv.ready); i++) await pause(100)
    await pause(1800); api.ui.dialog.clear()
    assert.equal(get().character, trial.character, 'candidate must be selected without smoke repair')
    api.kv.set(preferenceKey, { ...get(), animate: false })
    await capture('home-idle', 'prompt')
    await api.keymap.dispatchCommand('opencode-pals.settings'); await pause()
    await choose('Character:'); assert(screen().includes(trial.characterName), 'candidate missing from /pals')
    await choose(trial.characterName)
    for (const mood of ['thinking', 'working', 'waiting', 'done', 'error', 'interrupted', 'idle']) {
      // Real slash autocomplete and selection, never prompt.submit().
      await input('/pals-trial'); await input('\r')
      assert(screen().includes('Pals trial mood'), 'trial slash command missing')
      await choose(mood); await capture(`home-${mood}`, 'prompt')
    }
    await api.keymap.dispatchCommand('opencode-pals.trial-mood'); await pause()
    await choose('View sidebar'); await pause(1500)
    await capture('sidebar-idle', 'sidebar')
    await api.keymap.dispatchCommand('opencode-pals.trial-mood'); await pause(); await choose('error')
    await capture('sidebar-error', 'sidebar')
    const route = api.route.current
    assert.equal(route.name, 'session')
    const sessionID = String('params' in route && route.params?.sessionID)
    assert.equal(api.state.provider.length, 0)
    assert.equal((await api.client.provider.list()).data!.all.length, 0)
    assert.equal(api.state.session.messages(sessionID).length, 0)
    await api.client.session.delete({ sessionID })
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: true, version: api.app.version,
      providerCount: 0, messageCount: 0, defaultCandidate: trial.character, nativeMenu: true,
      moods: 7, observations, plugins: api.plugins.list() }, null, 2))
  }
  void run().catch(async error => {
    await Bun.write(`${directory}/failure.txt`, screen())
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, error: String(error), stack: error.stack, observations }, null, 2))
  })
} } satisfies TuiPluginModule
