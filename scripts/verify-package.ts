// Called by prepack: inspect the actual npm inventory without recursing into prepack.
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const manifest = await Bun.file('package.json').json()
assert.equal(manifest.name, 'opencode-pals')
assert.equal(manifest.private, undefined)
assert.equal(manifest.license, 'MIT')
assert.equal(manifest.bin['opencode-pals'], 'dist/cli.js')
assert.equal(manifest.exports['./tui'], './dist/index.js')
assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0)
const child = Bun.spawn(['npm', 'pack', '--dry-run', '--ignore-scripts', '--json'], { stdout: 'pipe', stderr: 'inherit' })
const inventory = JSON.parse(await new Response(child.stdout).text())[0]
assert.equal(await child.exited, 0)
assert.deepEqual(inventory.files.map((file: { path: string }) => file.path).sort(),
  ['LICENSE', 'README.md', 'dist/cli.js', 'dist/index.js', 'docs/character-workflow.md',
    'docs/images/pals.png', 'docs/integration-evidence.md', 'docs/setup.md', 'package.json'])
for (const file of manifest.files) assert((await stat(file)).size > 0, file)
const built = await Bun.file('dist/index.js').text()
const meta = await Bun.file('dist/metafile.json').json()
for (const art of ['catalog', 'jelly', 'hats', 'compose', 'timeline', 'raster'])
  assert(Object.keys(meta.inputs).some(name => name.endsWith(`/art/${art}.ts`)), `${art} runtime art missing`)
assert(Object.keys(meta.inputs).every(name => !name.includes('node_modules/') && !name.includes('tests/')))
const hostImports = [...new Set(new Bun.Transpiler({ loader: 'js' }).scanImports(built).map(item => item.path))].sort()
assert.deepEqual(hostImports, ['@opentui/core', '@opentui/solid', 'solid-js'])
const cli = await readFile('dist/cli.js', 'utf8')
assert(cli.startsWith('#!/usr/bin/env node\n'))
assert((await stat('dist/cli.js')).mode & 0o111)
const imports = new Bun.Transpiler({ loader: 'js' }).scanImports(cli.replace(/^#![^\n]*\n/, ''))
assert(imports.every(item => item.path.startsWith('node:')), 'CLI must bundle every non-Node dependency')
const help = Bun.spawn(['node', 'dist/cli.js', '--help'], { stdout: 'inherit', stderr: 'inherit' })
assert.equal(await help.exited, 0)
console.log(`Package inventory and Node CLI verified: ${inventory.files.length} files`)
