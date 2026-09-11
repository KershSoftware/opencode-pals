// Source archive audit: no dependencies, builds, sessions, or user config copied.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const source = resolve(import.meta.dir, '..')
const root = await realpath(await mkdtemp(join(tmpdir(), 'pals-fresh-')))
const checkout = join(root, 'checkout'), home = join(root, 'home')
await mkdir(checkout); await mkdir(home)
const env: Record<string, string | undefined> = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'),
  XDG_DATA_HOME: join(home, '.local/share'), XDG_STATE_HOME: join(home, '.local/state'),
  XDG_CACHE_HOME: join(home, '.cache'), BUN_INSTALL_CACHE_DIR: join(home, '.bun/install/cache') }
delete env.SUPERPOWERS_DIR
const commands: string[][] = []
async function run(command: string[], cwd = checkout) {
  commands.push(command)
  const child = Bun.spawn(command, { cwd, env, stdout: 'inherit', stderr: 'inherit' })
  assert.equal(await child.exited, 0, command.join(' '))
}
const archive = join(root, 'source.tgz')
const entries = ['.gitignore', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json',
  'tui.json', 'README.md', 'AGENTS.md', '.opencode', 'src', 'demo', 'scripts', 'tests', 'docs']
await run(['tar', '--exclude=__pycache__', '--exclude=*.tgz', '-czf', archive, ...entries], source)
await run(['tar', '-xzf', archive, '-C', checkout])
for (const reference of ['AGENTS.md', ...['pals-create-character', 'pals-try-native', 'pals-global-setup']
  .map(name => `.opencode/skills/${name}/SKILL.md`)])
  assert.equal(await Bun.file(join(checkout, reference)).text(), await Bun.file(join(source, reference)).text())
const manifest = await Bun.file(join(checkout, 'package.json')).json()
const lock = Bun.JSON5.parse(await Bun.file(join(checkout, 'bun.lock')).text()) as { workspaces: Record<string, { name: string }> }
assert.equal(manifest.name, 'opencode-pals')
assert.equal(lock.workspaces[''].name, manifest.name)
for (const absent of ['node_modules', 'dist', '.superpowers', '.playwright-mcp'])
  assert(!existsSync(join(checkout, absent)))
await run([process.execPath, 'install', '--frozen-lockfile'])
await run([process.execPath, 'run', 'install:global', '--help'])
await run([process.execPath, 'run', 'uninstall:global', '--help'])
await run([process.execPath, 'test'])
await run([process.execPath, 'run', 'typecheck'])
await run([process.execPath, 'run', 'build'])
await run([process.execPath, 'tests/fixtures/capture-approved.ts'])
await run([process.execPath, '-e', `const { buildScreen } = await import('./scripts/demo.ts'); const html = await buildScreen(); if (!html.includes('OpenCode Pals') || !html.includes('<canvas')) throw Error('demo missing'); console.log('Fresh demo HTML built from checked-in sources')`])
assert.deepEqual(await Bun.file(join(checkout, 'tui.json')).json(), {
  $schema: 'https://opencode.ai/tui.json', plugin: ['./dist/index.js'],
})
// The runtime archive must carry the one-purpose installer and its dependency.
const packed = join(root, 'packed'), unpacked = join(root, 'unpacked')
await mkdir(packed); await mkdir(unpacked)
await run([process.execPath, 'pm', 'pack', '--destination', packed])
await run(['tar', '-xzf', join(packed, `opencode-pals-${manifest.version}.tgz`), '-C', unpacked])
const runtime = join(unpacked, 'package')
assert(existsSync(join(runtime, 'scripts/global-setup.ts')))
assert(!existsSync(join(runtime, 'tui.json')))
await run([process.execPath, 'install', '--production'], runtime)
await run([process.execPath, 'run', 'install:global'], runtime)
const installed = join(env.XDG_CONFIG_HOME!, 'opencode/pals/index.js')
assert.deepEqual(await Bun.file(installed).arrayBuffer(), await Bun.file(join(runtime, 'dist/index.js')).arrayBuffer())
await run([process.execPath, 'run', 'uninstall:global'], runtime)
assert(!existsSync(installed))
console.log(JSON.stringify({ ok: true, root, checkout, isolatedHome: home, commands }, null, 2))
