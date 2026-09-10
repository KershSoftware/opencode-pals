import assert from 'node:assert/strict'
import { mkdtemp, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const out = await realpath(await mkdtemp(join(tmpdir(), 'pals-package-')))
const pack = Bun.spawn(['bun', 'pm', 'pack', '--destination', out], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
assert.equal(await pack.exited, 0)
const archive = (await readdir(out)).find(name => name.endsWith('.tgz'))!
const extract = Bun.spawn(['tar', '-xzf', join(out, archive), '-C', out], { stdout: 'inherit', stderr: 'inherit' })
assert.equal(await extract.exited, 0)
const pkg = join(out, 'package')
const entries = (await readdir(pkg, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(pkg.length + 1)).sort()
assert.deepEqual(entries, ['README.md', 'dist/index.js', 'docs/character-workflow.md', 'docs/integration-evidence.md', 'package.json'])
const manifest = await Bun.file(join(pkg, 'package.json')).json()
assert.equal(manifest.name, 'opencode-pals')
assert.equal(manifest.exports['./tui'], './dist/index.js')
const built = await Bun.file(join(root, 'dist/index.js')).text()
assert.equal(await Bun.file(join(pkg, 'dist/index.js')).text(), built)
const meta = await Bun.file(join(root, 'dist/metafile.json')).json()
for (const art of ['catalog', 'jelly', 'hats', 'compose', 'timeline', 'raster'])
  assert(Object.keys(meta.inputs).some(name => name.endsWith(`/art/${art}.ts`)), `${art} runtime art missing`)
assert(Object.keys(meta.inputs).every(name => !name.includes('node_modules/') && !name.includes('tests/')))
const imports = [...new Set(new Bun.Transpiler({ loader: 'js' }).scanImports(built).map(item => item.path))].sort()
assert.deepEqual(imports, ['@opentui/core', '@opentui/solid', 'solid-js'])
const result = { ok: true, archive: join(out, archive), entry: join(pkg, 'dist/index.js'), entries,
  bundledRuntimeArtwork: true, bundledHostDependencies: false, sha256: new Bun.CryptoHasher('sha256').update(built).digest('hex') }
await Bun.write(join(root, '.superpowers/package-audit.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
