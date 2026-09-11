// Real npm exec/global-bin acceptance, isolated from login/config/cache.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'jsonc-parser'

const source = resolve(import.meta.dir, '..')
const root = await mkdtemp(join(tmpdir(), 'pals npm acceptance '))
const home = join(root, 'home'), packed = join(root, 'packed'), prefix = join(root, 'prefix')
await mkdir(home); await mkdir(packed); await mkdir(prefix)
const config = join(home, '.config/opencode')
await mkdir(config, { recursive: true })
const env = { PATH: process.env.PATH!, HOME: home, XDG_CONFIG_HOME: join(home, '.config'),
  XDG_DATA_HOME: join(home, '.local/share'), XDG_STATE_HOME: join(home, '.local/state'), XDG_CACHE_HOME: join(home, '.cache'),
  npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'npmrc'),
  npm_config_globalconfig: join(root, 'global-npmrc'), npm_config_registry: 'https://registry.npmjs.org/' }
const commands: { command: string[]; cwd: string }[] = []
async function run(command: string[], cwd = home) {
  commands.push({ command, cwd })
  const child = Bun.spawn(command, { cwd, env, stdout: 'inherit', stderr: 'inherit' })
  assert.equal(await child.exited, 0, command.join(' '))
}
const manifest = await Bun.file(join(source, 'package.json')).json()
// Release CI supplies the archive it will publish; standalone runs still build one.
assert(process.argv.length <= 3, 'Usage: bun scripts/verify-npm-install.ts [tarball]')
if (!process.argv[2]) await run(['npm', 'pack', '--pack-destination', packed], source)
const tarball = process.argv[2] ? resolve(process.argv[2]) : join(packed, `opencode-pals-${manifest.version}.tgz`)
const exec = ['npm', 'exec', '--yes', '--package', tarball, '--', 'opencode-pals']
await run([...exec, '--help'])
const file = join(config, 'tui.jsonc'), prefs = join(config, 'preferences.json')
await writeFile(file, '{\n // retain comment\n "theme":"custom", "plugin":[["other-plugin", {"enabled":false}]],\n}\n')
await writeFile(prefs, 'untouched preferences')
await run([...exec, 'install'])
const first = await readFile(file, 'utf8'), entry = join(config, 'pals/index.js')
const bytes = await readFile(join(source, 'dist/index.js'))
assert.deepEqual(await readFile(entry), bytes)
await run([...exec, 'install'])
assert.equal(await readFile(file, 'utf8'), first)
await run(['npm', 'install', '--global', '--prefix', prefix, tarball])
const bin = join(prefix, 'bin/opencode-pals')
await run([bin, '--help'])
await run([bin, 'install'])
assert.equal(await readFile(file, 'utf8'), first)
// Relocating the installing package cannot affect the copied host artifact.
const packagePath = join(prefix, 'lib/node_modules/opencode-pals'), moved = join(root, 'moved package')
await rename(packagePath, moved)
assert.deepEqual(await readFile(entry), bytes)
await run(['node', join(moved, 'dist/cli.js'), 'install'])
await run(['node', join(moved, 'dist/cli.js'), 'uninstall'])
await rename(moved, packagePath)
await run([bin, 'uninstall'])
await run([...exec, 'uninstall'])
assert(!existsSync(entry))
const removed = await readFile(file, 'utf8')
assert(removed.includes('// retain comment'))
assert.deepEqual(parse(removed), { theme: 'custom', plugin: [['other-plugin', { enabled: false }]] })
assert.equal(await readFile(prefs, 'utf8'), 'untouched preferences')
await run(['npm', 'uninstall', '--global', '--prefix', prefix, 'opencode-pals'])
const evidence = { ok: true, root, tarball, node: Bun.spawnSync(['node', '--version']).stdout.toString().trim(), commands }
await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence, null, 2))
