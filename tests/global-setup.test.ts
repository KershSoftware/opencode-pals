import { afterEach, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, type ParseError } from 'jsonc-parser'

const repo = resolve(import.meta.dir, '..')
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pals global test ')); roots.push(root)
  const home = join(root, 'home'), config = join(root, 'xdg config', 'opencode')
  await mkdir(home); await mkdir(config, { recursive: true })
  const checkout = join(root, 'package with spaces')
  await mkdir(join(checkout, 'scripts'), { recursive: true }); await mkdir(join(checkout, 'dist'))
  await cp(join(repo, 'scripts/global-setup.ts'), join(checkout, 'scripts/global-setup.ts'))
  await cp(join(repo, 'package.json'), join(checkout, 'package.json'))
  await symlink(join(repo, 'node_modules'), join(checkout, 'node_modules'), 'dir')
  await writeFile(join(checkout, 'dist/index.js'), 'export default { id: "opencode-pals", tui() {} }\n')
  const env = { PATH: process.env.PATH!, HOME: home, XDG_CONFIG_HOME: join(root, 'xdg config') }
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, join(checkout, 'scripts/global-setup.ts'), ...args], {
      cwd: home, env, stdout: 'pipe', stderr: 'pipe',
    })
    return { code: await child.exited, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() }
  }
  return { root, home, config, checkout, env, run, entry: join(config, 'pals/index.js'), url: pathToFileURL(join(config, 'pals/index.js')).href }
}

// Catches destructive config rewrites, wrong scope, checkout-dependent installs, and duplicate registration.
test('install/update/uninstall preserves unrelated JSONC settings and artifacts from a different cwd', async () => {
  const f = await fixture()
  const file = join(f.config, 'tui.jsonc')
  const original = '{\n  // keep theme\n  "theme": "opencode",\n  "plugin": [\n    // keep options\n    ["unrelated-plugin", {"enabled": false}],\n  ],\n  "plugin_enabled": {"unrelated-plugin": false}\n}\n'
  await writeFile(file, original)
  await writeFile(join(f.config, 'preferences.json'), 'user preferences')
  const installed = await f.run('install')
  expect(installed.code, installed.err).toBe(0)
  expect(await readFile(f.entry)).toEqual(await readFile(join(f.checkout, 'dist/index.js')))
  const first = await readFile(file, 'utf8')
  expect(first).toContain('// keep theme'); expect(first).toContain('// keep options')
  expect(first).toContain(f.url)
  expect((await f.run('install')).code).toBe(0)
  expect(await readFile(file, 'utf8')).toBe(first)
  await writeFile(join(f.config, 'pals/keep.txt'), 'not ours')
  expect((await f.run('uninstall')).code).toBe(0)
  const removed = await readFile(file, 'utf8')
  expect(removed).not.toContain(f.url)
  expect(removed).toContain('// keep options')
  expect(parse(removed).plugin).toEqual([['unrelated-plugin', { enabled: false }]])
  expect(removed).toContain('"plugin_enabled": {"unrelated-plugin": false}')
  expect(existsSync(f.entry)).toBe(false)
  expect(await readFile(join(f.config, 'pals/keep.txt'), 'utf8')).toBe('not ours')
  expect(await readFile(join(f.config, 'preferences.json'), 'utf8')).toBe('user preferences')
  expect((await f.run('uninstall')).code).toBe(0)
  expect(await readFile(file, 'utf8')).toBe(removed)
})

test('missing build prevents writes; uninstall needs no build and update replaces copied bytes', async () => {
  const f = await fixture(), source = join(f.checkout, 'dist/index.js')
  await rm(source)
  const missing = await f.run('install')
  expect(missing.code).toBe(1); expect(missing.err).toContain('bun run build')
  expect(existsSync(join(f.config, 'pals'))).toBe(false)
  expect(existsSync(join(f.config, 'tui.json'))).toBe(false)
  expect((await f.run('uninstall')).code).toBe(0)
  await writeFile(source, 'first build')
  expect((await f.run('install')).code).toBe(0)
  await writeFile(source, 'updated build')
  expect((await f.run('install')).code).toBe(0)
  expect(await readFile(f.entry, 'utf8')).toBe('updated build')
  await rm(source)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(existsSync(join(f.config, 'pals'))).toBe(false)
})

test('package CLI works after moving checkout, respects HOME fallback and rejects relative XDG', async () => {
  const f = await fixture()
  const moved = join(f.root, 'moved package with spaces'); await rename(f.checkout, moved)
  const run = async (action: string, env: Record<string, string | undefined>, ...args: string[]) => {
    const child = Bun.spawn([process.execPath, 'run', '--cwd', moved, action + ':global', ...args], {
      cwd: f.home, env, stdout: 'pipe', stderr: 'pipe',
    })
    return { code: await child.exited, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() }
  }
  const env = { ...f.env, XDG_CONFIG_HOME: undefined }
  expect((await run('install', { ...env, XDG_CONFIG_HOME: 'relative' })).code).toBe(1)
  expect(existsSync(join(f.home, 'relative'))).toBe(false)
  const install = await run('install', env)
  expect(install.code, install.err).toBe(0)
  const entry = join(f.home, '.config/opencode/pals/index.js')
  expect(existsSync(entry)).toBe(true)
  expect(existsSync(join(f.config, 'tui.json'))).toBe(false)
  for (const action of ['install', 'uninstall']) {
    const help = await run(action, env, '--help')
    expect(help.code).toBe(0); expect(help.out).toContain('XDG_CONFIG_HOME')
  }
  expect((await run('uninstall', env)).code).toBe(0)
  expect(existsSync(entry)).toBe(false)
})

test('unowned artifact and managed symlinks are rejected before config writes', async () => {
  const f = await fixture(), file = join(f.config, 'tui.json')
  await writeFile(file, '{}')
  await mkdir(join(f.config, 'pals'))
  await writeFile(f.entry, 'unowned')
  for (const action of ['install', 'uninstall']) {
    expect((await f.run(action)).code).toBe(1)
    expect(await readFile(file, 'utf8')).toBe('{}')
    expect(await readFile(f.entry, 'utf8')).toBe('unowned')
  }
  await rm(f.entry)
  const victim = join(f.root, 'victim'); await writeFile(victim, '{}')
  await symlink(victim, f.entry)
  expect((await f.run('install')).code).toBe(1)
  await rm(f.entry); await rm(file); await symlink(victim, file)
  expect((await f.run('install')).code).toBe(1)
  expect(await readFile(victim, 'utf8')).toBe('{}')
})

test('nested tui plugin arrays follow host normalization and preserve neighboring comments', async () => {
  const f = await fixture(), file = join(f.config, 'tui.jsonc')
  await writeFile(file, '{"tui": {"plugin": [\n// before\n"one",\n// after\n["two", {"a":1}]\n]}, "mouse": false}')
  expect((await f.run('install')).code).toBe(0)
  expect(parse(await readFile(file, 'utf8')).tui.plugin).toContain(f.url)
  expect((await f.run('uninstall')).code).toBe(0)
  const text = await readFile(file, 'utf8')
  expect(text).toContain('// before'); expect(text).toContain('// after')
  expect(parse(text)).toEqual({ tui: { plugin: ['one', ['two', { a: 1 }]] }, mouse: false })
})

test('higher-precedence empty plugin array cannot mask an existing lower Pals tuple', async () => {
  const f = await fixture()
  const lower = JSON.stringify({ plugin: [[f.url, { retain: 42 }]] })
  await writeFile(join(f.config, 'tui.json'), lower)
  await writeFile(join(f.config, 'tui.jsonc'), '// higher\n{"plugin":[]}')
  expect((await f.run('install')).code).toBe(0)
  expect(parse(await readFile(join(f.config, 'tui.jsonc'), 'utf8')).plugin).toEqual([[f.url, { retain: 42 }]])
  expect(await readFile(join(f.config, 'tui.json'), 'utf8')).toBe(lower)
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  const texts = await Promise.all(['tui.json', 'tui.jsonc'].map(name => readFile(join(f.config, name), 'utf8')))
  expect(parse(texts[1]).plugin).toEqual([])
  expect(effectivePlugins(texts)).toEqual([])
})

test('uninstall removes a now-empty plugin key so unrelated plugins in lower JSON still load', async () => {
  const f = await fixture()
  const lower = '{"plugin":[["unrelated",{"keep":true}]]}'
  await writeFile(join(f.config, 'tui.json'), lower)
  await writeFile(join(f.config, 'tui.jsonc'), '// preserve\n{"theme":"opencode"}')
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(await readFile(join(f.config, 'tui.json'), 'utf8')).toBe(lower)
  const upper = await readFile(join(f.config, 'tui.jsonc'), 'utf8')
  expect(upper).toContain('// preserve')
  expect(parse(upper)).toEqual({ theme: 'opencode' })
})

test('both files are read: install prefers JSONC, keeps existing tuple options, uninstall removes both exact URLs', async () => {
  const f = await fixture()
  const json = join(f.config, 'tui.json'), jsonc = join(f.config, 'tui.jsonc')
  await writeFile(json, '{"plugin": ["other"], "theme":"first"}')
  await writeFile(jsonc, '// higher precedence\n{"plugin": [["second", {"x":1}]], "theme":"second"}')
  expect((await f.run('install')).code).toBe(0)
  expect(await readFile(json, 'utf8')).not.toContain(f.url)
  expect(await readFile(jsonc, 'utf8')).toContain(f.url)
  const lower = JSON.stringify({ plugin: [[f.url, { custom: 'keep' }], 'other'] })
  const higher = '// higher precedence\n' + JSON.stringify({ plugin: [[f.url, { custom: 'higher' }], f.url + '.other'] })
  await writeFile(json, lower); await writeFile(jsonc, higher)
  expect((await f.run('install')).code).toBe(0)
  expect(await readFile(json, 'utf8')).toBe(lower)
  expect(await readFile(jsonc, 'utf8')).toBe(higher)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(JSON.parse(await readFile(json, 'utf8')).plugin).toEqual(['other'])
  expect(await readFile(jsonc, 'utf8')).toContain(f.url + '.other')
  expect(await readFile(jsonc, 'utf8')).not.toContain('higher"')
})

test.each(['{', '[]', '{"plugin":{}}', '{"plugin":[["x", false]]}', '{"plugin":[],"plugin":[]}'])('invalid config %s prevents every write', async text => {
  const f = await fixture()
  await writeFile(join(f.config, 'tui.json'), text)
  await writeFile(join(f.config, 'tui.jsonc'), '{"theme":"opencode"}')
  for (const action of ['install', 'uninstall']) {
    const result = await f.run(action)
    expect(result.code).toBe(1)
    expect(result.err).toContain('tui.json')
    expect(await readFile(join(f.config, 'tui.json'), 'utf8')).toBe(text)
    expect(await readFile(join(f.config, 'tui.jsonc'), 'utf8')).toBe('{"theme":"opencode"}')
    expect(existsSync(join(f.config, 'pals'))).toBe(false)
  }
})

test('help and invalid arguments have no side effects', async () => {
  const f = await fixture()
  for (const action of ['install', 'uninstall']) {
    const result = await f.run(action, '--help')
    expect(result.code).toBe(0); expect(result.out).toContain('XDG_CONFIG_HOME')
  }
  expect((await f.run('install', '--force')).code).toBe(1)
  expect(existsSync(join(f.config, 'tui.json'))).toBe(false)
  expect(existsSync(join(f.config, 'pals'))).toBe(false)
})

// Model the pinned loader's origin accumulation and empty-array override, independently
// of installer internals. Fixtures use literal specs so no path/npm resolution is needed.
function effectivePlugins(texts: string[]) {
  const origins = new Map<string, unknown>()
  let effective: unknown[] = []
  for (const text of texts) {
    const value = parse(text), normalized = { ...value.tui, ...value }
    if (!('plugin' in normalized)) continue
    effective = normalized.plugin
    if (!effective.length) continue
    for (const spec of effective) origins.set(typeof spec === 'string' ? spec : (spec as string[])[0], spec)
    effective = [...origins.values()]
  }
  return effective
}

test.each(['"plugin": []', '"tui": {"plugin": []}'])('rejects masked unrelated plugins before writes: %s', async override => {
  const f = await fixture()
  const lower = '{"plugin":[["other", {"keep":true}]],"mouse":false}'
  const higher = `// explicit override\n{${override}, "theme":"opencode"}`
  await writeFile(join(f.config, 'tui.json'), lower)
  await writeFile(join(f.config, 'tui.jsonc'), higher)
  expect(effectivePlugins([lower, higher])).toEqual([])
  for (let i = 0; i < 2; i++) {
    const result = await f.run('install')
    expect(result.code, result.err).toBe(1)
    expect(result.err).toContain('suppressed unrelated plugins')
    expect(await readFile(join(f.config, 'tui.json'), 'utf8')).toBe(lower)
    expect(await readFile(join(f.config, 'tui.jsonc'), 'utf8')).toBe(higher)
    expect(existsSync(join(f.config, 'pals'))).toBe(false)
  }
  expect((await f.run('uninstall')).code).toBe(0)
  expect(effectivePlugins([await readFile(join(f.config, 'tui.json'), 'utf8'), await readFile(join(f.config, 'tui.jsonc'), 'utf8')])).toEqual([])
})

test.each(['"plugin": []', '"tui": {"plugin": []}'])('restores original empty key across repeated installs: %s', async override => {
  const f = await fixture(), file = join(f.config, 'tui.jsonc')
  const original = `// original empty\n{${override}, "mouse":false, "plugin_enabled":{"other":false}}`
  await writeFile(file, original)
  expect((await f.run('install')).code).toBe(0)
  const manifest = await readFile(join(f.config, 'pals/.opencode-pals-install'), 'utf8')
  expect(effectivePlugins([await readFile(file, 'utf8')])).toEqual([f.url])
  expect((await f.run('install')).code).toBe(0)
  expect(await readFile(join(f.config, 'pals/.opencode-pals-install'), 'utf8')).toBe(manifest)
  expect((await f.run('uninstall')).code).toBe(0)
  const removed = await readFile(file, 'utf8')
  expect(parse(removed)).toEqual(parse(original))
  expect(removed).toContain('// original empty')
  expect(effectivePlugins([removed])).toEqual([])
  expect((await f.run('uninstall')).code).toBe(0)
  expect(await readFile(file, 'utf8')).toBe(removed)
})

test.each([0, 1, 2])('removing Pals at index %i retains neighboring line/block comments and surviving options', async index => {
  const f = await fixture(), file = join(f.config, 'tui.json')
  expect((await f.run('install')).code).toBe(0)
  const items = ['["other", {"x": 1}]', '"last"']
  items.splice(index, 0, JSON.stringify(f.url))
  // Index zero includes the exact review reproduction: Pals, then a comment for other.
  const text = `{
  "mouse": false,
  "plugin": [
    ${items[0]},
    // keep options for other
    ${items[1]}, /* keep last options */
    ${items[2]} // keep end note
  ],
  "theme": "opencode"
}\n`.replaceAll('\n', '\r\n')
  await writeFile(file, text)
  expect((await f.run('uninstall')).code).toBe(0)
  const removed = await readFile(file, 'utf8'), errors: ParseError[] = []
  expect(parse(removed, errors)).toEqual({ mouse: false, plugin: [['other', { x: 1 }], 'last'], theme: 'opencode' })
  expect(errors).toEqual([])
  for (const comment of ['// keep options for other', '/* keep last options */', '// keep end note']) expect(removed).toContain(comment)
  expect(removed).toContain('\r\n')
})

test.each([0, 1, 2])('removing helper-created Pals-only property at position %i retains commented-out config', async index => {
  const f = await fixture(), file = join(f.config, 'tui.json')
  expect((await f.run('install')).code).toBe(0)
  const properties = ['"mouse": false', '"theme": "opencode"']
  properties.splice(index, 0, `"plugin": [
    // "unrelated-disabled-plugin",
    [${JSON.stringify(f.url)}, {/* retain option note */ "x":1}]
    /* keep configuration example */
  ]`)
  await writeFile(file, `{${properties.join(',\n')}}`)
  expect((await f.run('uninstall')).code).toBe(0)
  const removed = await readFile(file, 'utf8'), errors: ParseError[] = []
  expect(parse(removed, errors)).toEqual({ mouse: false, theme: 'opencode' })
  expect(errors).toEqual([])
  for (const comment of ['// "unrelated-disabled-plugin",', '/* retain option note */', '/* keep configuration example */']) expect(removed).toContain(comment)
})

test('repeated installation preserves pre-existing empty pals directory inode and permissions', async () => {
  const f = await fixture(), dir = join(f.config, 'pals')
  await mkdir(dir, { mode: 0o750 })
  const before = await stat(dir)
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(existsSync(dir)).toBe(true)
  const after = await stat(dir)
  expect(after.ino).toBe(before.ino); expect(after.mode).toBe(before.mode)
  expect(existsSync(f.entry)).toBe(false)
})

test('restored empty override still suppresses lower unrelated plugins added while Pals was installed', async () => {
  const f = await fixture(), upper = join(f.config, 'tui.jsonc'), lower = join(f.config, 'tui.json')
  await writeFile(upper, '{"plugin":[],"mouse":false}')
  expect((await f.run('install')).code).toBe(0)
  await writeFile(lower, '{"plugin":[["other",{"keep":42}]]}')
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  const texts = await Promise.all([lower, upper].map(file => readFile(file, 'utf8')))
  expect(parse(texts[0])).toEqual({ plugin: [['other', { keep: 42 }]] })
  expect(parse(texts[1])).toEqual({ plugin: [], mouse: false })
  expect(effectivePlugins(texts)).toEqual([])
})

test('legacy upgrade retains its directory but removes a cleared nonempty plugin key', async () => {
  const f = await fixture(), dir = join(f.config, 'pals'), file = join(f.config, 'tui.json')
  await mkdir(dir)
  await writeFile(f.entry, 'old managed build')
  await writeFile(join(dir, '.opencode-pals-install'), 'opencode-pals global install v1\n')
  await writeFile(file, JSON.stringify({ plugin: [f.url], mouse: false }))
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(existsSync(dir)).toBe(true)
  expect(existsSync(f.entry)).toBe(false)
  expect(parse(await readFile(file, 'utf8'))).toEqual({ mouse: false })
})

test.each(['adopt-v2', 'upgrade-v1', 'uninstall-v1'])('%s: clearing upper Pals-only config keeps lower unrelated plugins effective', async mode => {
  const f = await fixture(), lower = join(f.config, 'tui.json'), upper = join(f.config, 'tui.jsonc')
  const originalLower = '// lower options\n{"plugin":[["other", {"keep":true}]],"theme":"opencode"}'
  const originalUpper = `// upper settings\n{"plugin":[${JSON.stringify(f.url)}],"mouse":false}`
  await writeFile(lower, originalLower); await writeFile(upper, originalUpper)
  expect(effectivePlugins([originalLower, originalUpper])).toEqual([['other', { keep: true }], f.url])
  if (mode !== 'adopt-v2') {
    await mkdir(join(f.config, 'pals'))
    await writeFile(f.entry, 'old managed build')
    await writeFile(join(f.config, 'pals/.opencode-pals-install'), 'opencode-pals global install v1\n')
  }
  if (mode !== 'uninstall-v1') {
    expect((await f.run('install')).code).toBe(0)
    const manifest = await readFile(join(f.config, 'pals/.opencode-pals-install'), 'utf8')
    expect((await f.run('install')).code).toBe(0)
    expect(await readFile(join(f.config, 'pals/.opencode-pals-install'), 'utf8')).toBe(manifest)
  }
  expect((await f.run('uninstall')).code).toBe(0)
  const texts = await Promise.all([lower, upper].map(file => readFile(file, 'utf8')))
  expect(texts[0]).toBe(originalLower)
  expect(texts[1]).toContain('// upper settings')
  expect(parse(texts[1])).toEqual({ mouse: false })
  expect(effectivePlugins(texts)).toEqual([['other', { keep: true }]])
  expect(existsSync(f.entry)).toBe(false)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(await readFile(upper, 'utf8')).toBe(texts[1])
})

test('invalid managed manifest cannot authorize config edits or artifact removal', async () => {
  const f = await fixture(), file = join(f.config, 'tui.json')
  expect((await f.run('install')).code).toBe(0)
  const text = await readFile(file, 'utf8'), bytes = await readFile(f.entry)
  const marker = join(f.config, 'pals/.opencode-pals-install')
  const malformed = '{"owner":"opencode-pals","version":2,"directoryCreated":true,"arrays":[{"file":"../other","path":["plugin"],"state":"absent"}]}'
  await writeFile(marker, malformed)
  for (const action of ['install', 'uninstall']) {
    const result = await f.run(action)
    expect(result.code).toBe(1); expect(result.err).toContain('Invalid Pals manifest')
    expect(await readFile(marker, 'utf8')).toBe(malformed)
    expect(await readFile(file, 'utf8')).toBe(text)
    expect(await readFile(f.entry)).toEqual(bytes)
  }
})

test.each(['adopt-v2', 'upgrade-v1', 'uninstall-v1'])('%s: exact nested-shadow trace retains a top-level empty override', async mode => {
  const f = await fixture(), upper = join(f.config, 'tui.jsonc')
  const original = `{
  "plugin": [${JSON.stringify(f.url)}],
  "tui": { "plugin": [
    // keep shadowed options
    ["shadowed-other", {"keep": true}]
  ] },
  "mouse": false
}`
  await writeFile(upper, original)
  expect(effectivePlugins([original])).toEqual([f.url])
  if (mode !== 'adopt-v2') {
    await mkdir(join(f.config, 'pals'))
    await writeFile(f.entry, 'old managed build')
    await writeFile(join(f.config, 'pals/.opencode-pals-install'), 'opencode-pals global install v1\n')
  }
  if (mode !== 'uninstall-v1') {
    const result = await f.run('install')
    expect(result.code, result.err).toBe(0)
    expect((await f.run('install')).code).toBe(0)
  }
  expect((await f.run('uninstall')).code).toBe(0)
  const text = await readFile(upper, 'utf8')
  expect(parse(text)).toEqual({ plugin: [], tui: { plugin: [['shadowed-other', { keep: true }]] }, mouse: false })
  expect(text).toContain('// keep shadowed options')
  expect(effectivePlugins([text])).toEqual([])
  expect(existsSync(f.entry)).toBe(false)
  expect((await f.run('uninstall')).code).toBe(0)
  expect(await readFile(upper, 'utf8')).toBe(text)
})

test('install rejects nested shadow plus active lower plugins before creating any artifacts', async () => {
  const f = await fixture(), lower = join(f.config, 'tui.json'), upper = join(f.config, 'tui.jsonc')
  const a = '// active lower\n{"plugin":[["other",{"keep":true}]]}'
  const b = `// shadowed nested\n{"plugin":[${JSON.stringify(f.url)}],"tui":{"plugin":[["shadowed-other",{"keep":true}]]},"mouse":false}`
  await writeFile(lower, a); await writeFile(upper, b)
  expect(effectivePlugins([a, b])).toEqual([['other', { keep: true }], f.url])
  for (let i = 0; i < 2; i++) {
    const result = await f.run('install')
    expect(result.code).toBe(1)
    expect(result.err).toContain('preserve unrelated plugin')
    expect(await readFile(lower, 'utf8')).toBe(a)
    expect(await readFile(upper, 'utf8')).toBe(b)
    expect(existsSync(join(f.config, 'pals'))).toBe(false)
  }
})

test.each(['existing-v2', 'legacy-v1'])('%s: impossible nested/lower precedence conflict leaves installed config and artifacts intact', async mode => {
  const f = await fixture(), lower = join(f.config, 'tui.json'), upper = join(f.config, 'tui.jsonc')
  const a = '// active lower\n{"plugin":[["other",{"keep":true}]],"theme":"opencode"}'
  await writeFile(lower, a)
  await writeFile(upper, JSON.stringify({ plugin: [f.url] }))
  const marker = join(f.config, 'pals/.opencode-pals-install')
  if (mode === 'existing-v2') expect((await f.run('install')).code).toBe(0)
  else {
    await mkdir(join(f.config, 'pals'))
    await writeFile(f.entry, 'old managed build')
    await writeFile(marker, 'opencode-pals global install v1\n')
  }
  const b = `// preserve shadow\n{"plugin":[${JSON.stringify(f.url)}],"tui":{"plugin":[["shadowed-other",{"keep":true}]]},"mouse":false}`
  await writeFile(upper, b)
  const bytes = await readFile(f.entry), manifest = await readFile(marker, 'utf8')
  for (const action of ['install', 'uninstall']) {
    const result = await f.run(action)
    expect(result.code).toBe(1)
    expect(result.err).toContain('preserve unrelated plugin')
    expect(await readFile(lower, 'utf8')).toBe(a)
    expect(await readFile(upper, 'utf8')).toBe(b)
    expect(await readFile(f.entry)).toEqual(bytes)
    expect(await readFile(marker, 'utf8')).toBe(manifest)
    expect(effectivePlugins([await readFile(lower, 'utf8'), await readFile(upper, 'utf8')])).toEqual([['other', { keep: true }], f.url])
  }
})

test('nested shadow in lower JSON can stay suppressed while unrelated upper plugins remain active', async () => {
  const f = await fixture(), lower = join(f.config, 'tui.json'), upper = join(f.config, 'tui.jsonc')
  const a = JSON.stringify({ plugin: [f.url], tui: { plugin: [['shadowed', { keep: true }]] } })
  const b = '// active upper\n{"plugin":[["active",{"keep":42}]],"mouse":false}'
  await writeFile(lower, a); await writeFile(upper, b)
  expect(effectivePlugins([a, b])).toEqual([f.url, ['active', { keep: 42 }]])
  expect((await f.run('install')).code).toBe(0)
  expect((await f.run('uninstall')).code).toBe(0)
  const texts = await Promise.all([lower, upper].map(file => readFile(file, 'utf8')))
  expect(parse(texts[0])).toEqual({ plugin: [], tui: { plugin: [['shadowed', { keep: true }]] } })
  expect(texts[1]).toBe(b)
  expect(effectivePlugins(texts)).toEqual([['active', { keep: 42 }]])
})
