import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findCompanion, parseServerInfo, publishScreen, ensureServer, serverReady } from '../scripts/companion'
import { buildScreen, inlineScript } from '../scripts/demo'

const roots: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => { for (const server of servers.splice(0)) await server.stop(true); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: request => new Response('companion', { status: new URL(request.url).searchParams.get('key') === 'example' ? 200 : 403 }) }); servers.push(server)
  const url = `${server.url}?key=example`
  const root = await mkdtemp(join(tmpdir(), 'pet demo with spaces ')); roots.push(root)
  const skill = join(root, 'skills/brainstorming')
  await mkdir(join(skill, 'scripts'), { recursive: true })
  const launcher = join(skill, 'scripts/start-server.sh')
  // External process double: validates actual argv and creates the actual state protocol.
  await Bun.write(launcher, `#!/usr/bin/env bash
set -eu
test "$1" = '--project-dir'
test "$2" = '${root}'
test "$3" = '--open'
mkdir -p "$2/session/content" "$2/session/state"
rm -f "$2/session/state/server-stopped"
printf '%s\\n' '{"type":"server-started","url":"${url}","screen_dir":"${root}/session/content","state_dir":"${root}/session/state"}' > "$2/session/state/server-info"
printf 'launcher diagnostic\\n'
cat "$2/session/state/server-info"
`)
  return { root, skill, launcher, server }
}

test('stale markers require a live authenticated endpoint and invoke the supported launcher for recovery', async () => {
  const { root, launcher, server } = await fixture()
  const info = await ensureServer(undefined, launcher, root, true)
  expect(await serverReady(info)).toBe(true)
  expect(await serverReady({ ...info, url: `${server.url}?key=wrong` })).toBe(false)
  await server.stop(true)
  expect(await Bun.file(join(info.state_dir, 'server-info')).exists()).toBe(true)
  expect(await serverReady(info)).toBe(false)
  await expect(ensureServer(info, join(root, 'missing-launcher'), root)).rejects.toThrow('launcher')
  const replacement = await fixture()
  const recovered = await ensureServer(info, replacement.launcher, replacement.root, true)
  expect(recovered.url).not.toBe(info.url)
  expect(await serverReady(recovered)).toBe(true)
  expect(await Bun.file(await publishScreen(recovered, 'recovered')).text()).toBe('recovered')
})

test('liveness probe has a bounded timeout even when the endpoint never responds', async () => {
  const { root, launcher } = await fixture()
  const info = await ensureServer(undefined, launcher, root, true)
  const hung = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Promise<Response>(() => {}) }); servers.push(hung)
  const start = performance.now()
  expect(await serverReady({ ...info, url: String(hung.url) })).toBe(false)
  expect(performance.now() - start).toBeLessThan(2500)
})

test('retains the authenticated URL and returned directories', () => {
  const info = parseServerInfo(JSON.stringify({ type: 'server-started', url: 'http://localhost:1234/?key=example', screen_dir: '/tmp/pet/content', state_dir: '/tmp/pet/state' }))
  expect(info).toEqual({ url: 'http://localhost:1234/?key=example', screen_dir: '/tmp/pet/content', state_dir: '/tmp/pet/state' })
  expect(() => parseServerInfo('{"type":"server-started"}')).toThrow()
})

test('rejects malformed startup records and ignores non-startup JSON lines', () => {
  for (const value of ['', '{}', '{"type":"server-stopped"}', '{"type":"server-started","url":"bad","screen_dir":"/tmp/c","state_dir":"/tmp/s"}']) expect(() => parseServerInfo(value)).toThrow()
})

test('discovers explicit package roots and skill directories; invalid override gives actionable prerequisite', async () => {
  const { root, skill, launcher } = await fixture()
  expect(await findCompanion(root)).toBe(launcher)
  expect(await findCompanion(skill)).toBe(launcher)
  await expect(findCompanion(join(root, 'missing'))).rejects.toThrow('scripts/start-server.sh')
  await expect(findCompanion(join(root, 'missing'))).rejects.toThrow('--superpowers-dir')
})

test('launches with space-safe argv, restarts stopped state, and never overwrites revisions', async () => {
  const { root, launcher } = await fixture()
  let info = await ensureServer(undefined, launcher, root, true)
  const first = await publishScreen(info, '<!DOCTYPE html><p>first</p>')
  const second = await publishScreen(info, '<!DOCTYPE html><p>second</p>')
  expect(first).not.toBe(second)
  expect(first).toMatch(/pals-\d+-\d+\.html$/)
  expect(await Bun.file(first).text()).toBe('<!DOCTYPE html><p>first</p>')
  await Bun.write(join(info.state_dir, 'server-stopped'), '{}')
  await expect(publishScreen(info, 'stale')).rejects.toThrow('stopped')
  info = await ensureServer(info, launcher, root, true)
  expect(await Bun.file(await publishScreen(info, 'restarted')).text()).toBe('restarted')
  await rm(join(info.state_dir, 'server-info'))
  await expect(publishScreen(info, 'missing')).rejects.toThrow('server-info')
})

test('build produces a self-contained full document with escaped script terminators', async () => {
  const html = await buildScreen()
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(html).not.toContain('src="')
  expect(html).not.toContain('<!-- BROWSER -->')
  expect(html.match(/<script>/g)?.length).toBe(1)
  expect(html.match(/<\/script>/g)?.length).toBe(1)
})

test('embedded closing script text keeps its JavaScript value without closing the HTML script', () => {
  const source = inlineScript('return "</ScRiPt><p>injected</p>"')
  expect(source.toLowerCase()).not.toContain('</script')
  expect(new Function(source)()).toBe('</ScRiPt><p>injected</p>')
})

test('environment override resolves a skill and explicit override wins over it', async () => {
  const { root, skill, launcher } = await fixture()
  const previous = process.env.SUPERPOWERS_DIR
  try {
    process.env.SUPERPOWERS_DIR = skill
    expect(await findCompanion()).toBe(launcher)
    process.env.SUPERPOWERS_DIR = join(root, 'missing')
    expect(await findCompanion(root)).toBe(launcher)
    await expect(findCompanion()).rejects.toThrow('SUPERPOWERS_DIR')
  } finally {
    if (previous === undefined) delete process.env.SUPERPOWERS_DIR
    else process.env.SUPERPOWERS_DIR = previous
  }
})
