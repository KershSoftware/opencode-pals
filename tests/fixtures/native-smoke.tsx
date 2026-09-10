// Loaded only by scripts/smoke-native.py, in an isolated OpenCode instance.
import assert from 'node:assert/strict'
import { createSolidSlotRegistry } from '@opentui/solid'
import type { TuiPlugin, TuiPluginModule, TuiSlotMap, TuiSlotContext } from '@opencode-ai/plugin/tui'
import { assertSidebarDirectory, assertSidebarFooter, sidebarFooterRows } from './sidebar-footer'

const tui: TuiPlugin = async (api, options) => {
  const directory = String(options?.artifacts)
  const mood = String(options?.mood)
  let registry: ReturnType<typeof createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>> | undefined
  let sameContextRejected = false
  api.slots.register({ slots: {}, setup(ctx, renderer) {
    registry = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(renderer, ctx)
    try { createSolidSlotRegistry(renderer, { theme: ctx.theme }) }
    catch (error) { sameContextRejected = String(error).includes('different context') }
  } })
  const pause = (ms: number) => Bun.sleep(ms)
  const capture = async (name: string) => {
    await pause(700)
    const buffer = api.renderer.currentRenderBuffer
    const text = new TextDecoder().decode(buffer.getRealCharBytes(true))
    await Bun.write(`${directory}/${name}.txt`, text)
    await Bun.write(`${directory}/${name}.json`, JSON.stringify({
      width: api.renderer.width, height: api.renderer.height,
      lines: buffer.getSpanLines(),
    }, null, 2))
    return text
  }
  const run = async () => {
    for (let i = 0; i < 300 && !api.state.ready; i++) await pause(100)
    assert(api.state.ready, 'host state never became ready')
    assert(await api.plugins.activate('opencode-pals'), 'plugin activation failed')
    api.kv.set('dismissed_getting_started', true)
    api.kv.set('sidebar', 'auto')
    // Creates an empty LOCAL session. No prompt, completion, or model request.
    const response = await api.client.session.create({ title: 'Task 3 native feasibility' })
    assert(response.data?.id, JSON.stringify(response.error))
    const id = response.data.id
    api.route.navigate('session', { sessionID: id })
    for (let i = 0; i < 200; i++) {
      const text = new TextDecoder().decode(api.renderer.currentRenderBuffer.getRealCharBytes(true))
      if (text.includes(`Jelly static: ${mood}`)) break
      await pause(100)
    }
    api.ui.dialog.clear()
    const decorated = await capture('decorated')
    assert(decorated.includes(`Jelly static: ${mood}`), 'static plugin did not render')
    assert(!decorated.includes('\x1b'), 'literal escape leaked into cells')
    assert(sameContextRejected, 'new context unexpectedly accepted')
    const initialEntries = registry!.resolveEntries('sidebar_footer').map(entry => entry.id)
    assert(initialEntries.includes('opencode-pals:1'), 'scoped wrapper missing')
    await api.plugins.deactivate('opencode-pals')
    const baseline = await capture('baseline')
    assert(!baseline.includes('Jelly static:'), 'pet survived deactivation')
    // Compare the ordered footer suffix within the same sidebar region in all
    // captures. The main status area's duplicate project path cannot satisfy it.
    const footerLines = sidebarFooterRows(baseline, api.renderer.width)
    assertSidebarDirectory(footerLines, process.cwd())
    assert(footerLines.at(-1)?.includes('OpenCode 1.18.30'), 'did not find baseline sidebar version below path')
    assertSidebarFooter(decorated, api.renderer.width, footerLines)
    await api.plugins.activate('opencode-pals')
    await pause(300)
    const competitorId = api.slots.register({ order: 0, slots: {
      sidebar_footer: () => <text height={1}>COMPETING CUSTOM FOOTER</text>,
    } })
    const competing = await capture('competing')
    assert(competing.includes('COMPETING CUSTOM FOOTER'), 'custom footer not preserved')
    assert(!competing.includes('Jelly static:'), 'pet did not yield')
    assert(!registry!.resolveEntries('sidebar_footer').some(entry => entry.id.startsWith('opencode-pals')), 'wrapper registration remains')
    registry!.unregister(competitorId)
    const restored = await capture('restored')
    assertSidebarFooter(restored, api.renderer.width, footerLines)
    assert(!restored.includes('Jelly static:'), 'unexpected automatic reactivation')
    assert.equal(registry!.getPluginErrors().length, 0, 'slot registry errors')
    const messageCount = api.state.session.messages(id).length
    const providerCount = api.state.provider.length
    assert.equal(messageCount, 0, 'smoke session unexpectedly contains messages')
    assert.equal(providerCount, 0, 'smoke unexpectedly enabled a provider')
    await api.client.session.delete({ sessionID: id })
    await Bun.write(`${directory}/result.json`, JSON.stringify({
      ok: true, version: api.app.version, bun: Bun.version, mood,
      dimensions: [api.renderer.width, api.renderer.height],
      initialEntries, sameContextRejected, footerLines,
      plugins: api.plugins.list(), slotErrors: registry!.getPluginErrors(),
      messageCount, providerCount,
    }, null, 2))
  }
  const timer = setTimeout(() => void run().catch(async error => {
    await capture('failure')
    await Bun.write(`${directory}/result.json`, JSON.stringify({ ok: false, error: String(error), stack: error.stack }, null, 2))
  }), 1000)
  api.lifecycle.onDispose(() => clearTimeout(timer))
}

export default { id: 'task3-native-smoke', tui } satisfies TuiPluginModule
