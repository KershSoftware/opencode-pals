import { afterEach, expect, test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const roots: string[] = []
const children: ReturnType<typeof Bun.spawn>[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
const urls = new Map<string, string>()
afterEach(async () => {
  for (const child of children.splice(0)) { if (child.exitCode === null) child.kill('SIGKILL'); await child.exited }
  for (const server of servers.splice(0)) await server.stop(true)
  urls.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function until(check: () => Promise<boolean>, description: string) {
  const end = Date.now() + 5000
  while (!await check()) { if (Date.now() > end) throw new Error(`Timed out: ${description}`); await Bun.sleep(20) }
}
async function watching(child: ReturnType<typeof Bun.spawn>) {
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
  let output = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error(`Watcher exited before ready: ${output}`)
      output += new TextDecoder().decode(chunk.value)
      if (output.includes('Watching src/art/ and demo/')) return
    }
  } finally { reader.releaseLock() }
}
async function sandbox() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'demo lifecycle '))); roots.push(root)
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: request => new Response('companion', { status: new URL(request.url).searchParams.get('key') === 'keep-me' ? 200 : 403 }) }); servers.push(server)
  const url = `${server.url}?key=keep-me&other=value`; urls.set(root, url)
  for (const dir of ['scripts', 'demo', 'src/art', 'src/tui/placement.ts']) await cp(resolve(import.meta.dir, '..', dir), join(root, dir), { recursive: true })
  const skill = join(root, 'companion'); await mkdir(join(skill, 'scripts'), { recursive: true })
  await Bun.write(join(skill, 'scripts/start-server.sh'), `#!/usr/bin/env bash
set -eu
test "$1" = '--project-dir'
root="$2"
mkdir -p "$root/session/content" "$root/session/state"
printf 'launch\\n' >> "$root/launches"
touch "$root/launch-entered"
while test -f "$root/delay-launch"; do sleep 0.02; done
printf '{"type":"server-started","url":"${url}","screen_dir":"%s/session/content","state_dir":"%s/session/state"}\\n' "$root" "$root" > "$root/session/state/server-info"
cat "$root/session/state/server-info"
`)
  // Delay the real metadata write after writing a partial value, to expose premature exit.
  await Bun.write(join(root, 'preload.ts'), `
const write = Bun.write.bind(Bun)
Bun.write = (async (path, data, ...rest) => {
  if (String(path).includes('/demo/session.json') && await Bun.file(${JSON.stringify(join(root, 'delay-write'))}).exists()) {
    await write(path, '{"partial":')
    await write(${JSON.stringify(join(root, 'write-entered'))}, 'yes')
    while (await Bun.file(${JSON.stringify(join(root, 'delay-write'))}).exists()) await Bun.sleep(20)
    if (await Bun.file(${JSON.stringify(join(root, 'fail-write'))}).exists()) throw new Error('fixture metadata write failure')
  }
  return write(path, data, ...rest)
}) as typeof Bun.write
`)
  const bin = join(root, 'bin'); await mkdir(bin)
  for (const name of ['open', 'xdg-open']) {
    const path = join(bin, name)
    await Bun.write(path, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${root}/opened'\n`); await chmod(path, 0o755)
  }
  const start = () => {
    const child = Bun.spawn([process.execPath, '--preload', join(root, 'preload.ts'), join(root, 'scripts/demo.ts'), '--open', '--superpowers-dir', skill], {
      cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdout: 'pipe', stderr: 'pipe', detached: true,
    }); children.push(child); return child
  }
  return { root, start, metadata: join(root, '.superpowers/demo/session.json') }
}
async function assertComplete(root: string, metadata: string, expectedScreens: number) {
  const saved = await Bun.file(metadata).json()
  expect(saved.info.state_dir).toBe(join(root, 'session/state'))
  expect(saved.info.url).toBe(urls.get(root)!)
  const screens = (await readdir(join(root, 'session/content'))).filter(p => p.endsWith('.html'))
  expect(screens.length).toBe(expectedScreens)
  for (const screen of screens) {
    const html = await Bun.file(join(root, 'session/content', screen)).text()
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.trimEnd().endsWith('</body></html>')).toBe(true)
  }
}

test.each(['initial startup', 'restart'])('terminal process-group SIGTERM during %s drains publication and records the new session', async mode => {
  const { root, start, metadata } = await sandbox()
  if (mode === 'restart') {
    const oldState = join(root, 'old-session/state')
    await mkdir(oldState, { recursive: true })
    await Bun.write(join(oldState, 'server-stopped'), '{}')
    await Bun.write(metadata, JSON.stringify({ info: { url: 'http://localhost:9999/?key=old', state_dir: oldState, screen_dir: join(root, 'old-session/content') }, launcher: join(root, 'companion/scripts/start-server.sh') }))
  }
  await Bun.write(join(root, 'delay-launch'), 'yes')
  const child = start()
  await until(() => Bun.file(join(root, 'launch-entered')).exists(), 'launcher gate')
  process.kill(-child.pid, 'SIGTERM'); await Bun.sleep(100)
  const stayedAlive = child.exitCode === null
  await rm(join(root, 'delay-launch'))
  expect(await child.exited).toBe(0)
  expect(stayedAlive).toBe(true)
  await assertComplete(root, metadata, 1)
}, 10000)

test.each(['successful write', 'failed write'])('SIGINT during rebuild settles %s and drops queued/debounced edits', async mode => {
  const { root, start, metadata } = await sandbox()
  const child = start()
  await watching(child)
  await Bun.write(join(root, 'delay-write'), 'yes')
  if (mode === 'failed write') await Bun.write(join(root, 'fail-write'), 'yes')
  await Bun.write(join(root, 'demo/first-edit.txt'), 'edit')
  await until(() => Bun.file(join(root, 'write-entered')).exists(), 'metadata write gate')
  expect((await Bun.file(metadata).json()).info.state_dir).toBe(join(root, 'session/state'))
  await Bun.write(join(root, 'demo/queued-edit.txt'), 'queued'); await Bun.sleep(250)
  await Bun.write(join(root, 'demo/debounced-edit.txt'), 'debounced')
  child.kill('SIGINT'); child.kill('SIGTERM'); await Bun.sleep(100)
  const stayedAlive = child.exitCode === null
  await rm(join(root, 'delay-write'))
  expect(await child.exited).toBe(0)
  expect(stayedAlive).toBe(true)
  await assertComplete(root, metadata, mode === 'failed write' ? 1 : 2)
  expect((await readdir(join(root, '.superpowers/demo'))).filter(p => p.endsWith('.tmp'))).toEqual([])
  if (mode === 'failed write') expect(await new Response(child.stderr).text()).toContain('Demo rebuild failed: fixture metadata write failure')
}, 10000)

test('--open reopens the full authenticated URL for a reused session only once, without relaunching', async () => {
  const { root, start, metadata } = await sandbox()
  const first = start()
  await watching(first)
  first.kill('SIGTERM'); await first.exited
  const second = start()
  await watching(second)
  const opened = await Bun.file(join(root, 'opened')).exists() ? await Bun.file(join(root, 'opened')).text() : ''
  await Bun.write(join(root, 'demo/rebuild.txt'), 'edit')
  await until(async () => (await readdir(join(root, 'session/content'))).length === 3, 'rebuild')
  second.kill('SIGTERM'); expect(await second.exited).toBe(0)
  expect(opened).toBe(`${urls.get(root)}\n`)
  expect(await Bun.file(join(root, 'opened')).text()).toBe(opened)
  expect(await Bun.file(join(root, 'launches')).text()).toBe('launch\n')
  await assertComplete(root, metadata, 3)
}, 10000)

test('a failed reused-session browser opener still watches and publishes source edits', async () => {
  const { root, start, metadata } = await sandbox()
  const first = start(); await watching(first); first.kill('SIGTERM'); await first.exited
  for (const name of ['open', 'xdg-open']) await Bun.write(join(root, 'bin', name), '#!/usr/bin/env bash\nexit 7\n')
  const second = start()
  await watching(second)
  await Bun.write(join(root, 'demo/opener-failure-edit.txt'), 'edit')
  await until(async () => (await readdir(join(root, 'session/content'))).length === 3, 'rebuild after opener failure')
  second.kill('SIGTERM'); expect(await second.exited).toBe(0)
  expect(await new Response(second.stderr).text()).toContain('Browser opener exited 7')
  await assertComplete(root, metadata, 3)
}, 10000)
