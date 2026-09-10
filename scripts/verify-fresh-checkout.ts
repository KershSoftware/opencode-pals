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
  'tui.json', 'README.md', 'src', 'demo', 'scripts', 'tests', 'docs']
await run(['tar', '--exclude=__pycache__', '--exclude=*.tgz', '-czf', archive, ...entries], source)
await run(['tar', '-xzf', archive, '-C', checkout])
const manifest = await Bun.file(join(checkout, 'package.json')).json()
const lock = Bun.JSON5.parse(await Bun.file(join(checkout, 'bun.lock')).text()) as { workspaces: Record<string, { name: string }> }
assert.equal(manifest.name, 'opencode-pals')
assert.equal(lock.workspaces[''].name, manifest.name)
for (const absent of ['node_modules', 'dist', '.superpowers', '.playwright-mcp'])
  assert(!existsSync(join(checkout, absent)))
await run([process.execPath, 'install', '--frozen-lockfile'])
await run([process.execPath, 'test'])
await run([process.execPath, 'run', 'typecheck'])
await run([process.execPath, 'run', 'build'])
await run([process.execPath, 'tests/fixtures/capture-approved.ts'])
await run([process.execPath, '-e', `const { buildScreen } = await import('./scripts/demo.ts'); const html = await buildScreen(); if (!html.includes('OpenCode Pals') || !html.includes('<canvas')) throw Error('demo missing'); console.log('Fresh demo HTML built from checked-in sources')`])
assert.deepEqual(await Bun.file(join(checkout, 'tui.json')).json(), {
  $schema: 'https://opencode.ai/tui.json', plugin: ['./dist/index.js'],
})
console.log(JSON.stringify({ ok: true, root, checkout, isolatedHome: home, commands }, null, 2))
