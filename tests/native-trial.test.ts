import { afterAll, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { usesDemonstrationOracle } from './fixtures/trial-oracle'

const root = resolve(import.meta.dir, '..')
const scratch = await mkdtemp(join(tmpdir(), 'pals trial test '))
afterAll(() => rm(scratch, { recursive: true, force: true }))
const source = `import { compactJelly } from ${JSON.stringify(join(root, 'src/art/compact.ts'))};
export default { ...compactJelly, id: 'trial-square', name: 'Trial square' }`
const candidate = join(scratch, 'candidate with spaces.ts')
await Bun.write(candidate, source)
const home = join(scratch, 'real home'); await mkdir(home)
const config = join(home, 'tui.json'); await Bun.write(config, '// sentinel global config')
await mkdir(join(home, 'opencode'))
const preferences = join(home, 'opencode/kv.json')
await Bun.write(preferences, '{"opencode-pals.preferences.v1":{"character":"real-user-pal"}}')
const preferencesBefore = await Bun.file(preferences).text()
const catalogPath = join(root, 'src/art/catalog.ts')
const catalogBefore = await Bun.file(catalogPath).text()
async function run(args: string[]) {
  const child = Bun.spawn([process.execPath, join(root, 'scripts/try-pal.ts'), ...args], {
    cwd: scratch, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home, XDG_STATE_HOME: home,
      OPENCODE_CONFIG: config, OPENCODE_CONFIG_CONTENT: '{"enabled_providers":["openai"]}', OPENAI_API_KEY: 'sentinel' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout, stderr, exit }
}

test('help works without a module or installed binary', async () => {
  const result = await run(['--help'])
  expect(result.exit, result.stderr).toBe(0)
  expect(result.stdout).toContain('bun run try:pal')
})

test('demonstration oracle requires exact prepared fixture content, not a stable character ID', async () => {
  const fixture = join(root, 'tests/fixtures/trial-character.ts')
  const revised = join(scratch, 'revised sprout.ts')
  await Bun.write(revised, (await Bun.file(fixture).text())
    .replaceAll('../../src/art/', `${root}/src/art/`).replace('#00aa44', '#aa0044'))
  for (const [file, oracle] of [[fixture, true], [revised, false]] as const) {
    const result = await run([file, '--prepare'])
    expect(result.exit, result.stderr).toBe(0)
    const trial = JSON.parse(result.stdout)
    try {
      expect(trial.character).toBe('trial-sprout')
      expect(trial.source).toBe(file)
      expect(trial.sourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(usesDemonstrationOracle(trial)).toBe(oracle)
      if (oracle) expect(usesDemonstrationOracle({ ...trial, source: revised })).toBe(false)
      if (!oracle) expect(usesDemonstrationOracle({ ...trial, source: fixture })).toBe(false)
    } finally { await rm(trial.directory, { recursive: true, force: true }) }
  }
  // Old manifests carry no verified source identity and must use generic checks.
  expect(usesDemonstrationOracle({ character: 'trial-sprout' })).toBe(false)
})

test('prepare builds a standalone artifact, selects candidate and isolates inherited config', async () => {
  const result = await run(['--', candidate, '--build-only'])
  expect(result.exit, result.stderr).toBe(0)
  const trial = JSON.parse(result.stdout)
  try {
    expect(await Bun.file(trial.entry).exists()).toBe(true)
    expect(await Bun.file(trial.config).json()).toMatchObject({ enabled_providers: [], plugin: [], mcp: {} })
    expect((await Bun.file(trial.tuiConfig).json()).plugin).toEqual([pathToFileURL(trial.entry).href])
    expect(trial.environment.HOME).not.toBe(home)
    expect(trial.environment.OPENCODE_CONFIG_CONTENT).toBeUndefined()
    expect(trial.environment.OPENAI_API_KEY).toBeUndefined()
    expect(trial.cwd.startsWith(trial.directory)).toBe(true)
    const kv = await Bun.file(join(trial.environment.XDG_STATE_HOME, 'opencode/kv.json')).json()
    expect(kv['opencode-pals.preferences.v1'].character).toBe('trial-square')
    expect(trial.cleanup).toContain(trial.directory)
    const imports = new Bun.Transpiler({ loader: 'js' }).scanImports(await Bun.file(trial.entry).text())
    expect(imports.every(i => /^(solid-js|@opentui\/|@opencode-ai\/)/.test(i.path))).toBe(true)
    expect(await Bun.file(catalogPath).text()).toBe(catalogBefore)
    expect(await Bun.file(config).text()).toBe('// sentinel global config')
    expect(await Bun.file(preferences).text()).toBe(preferencesBefore)
  } finally { await rm(trial.directory, { recursive: true, force: true }) }
})

test('invalid modules fail before launch and leave no prepared directories', async () => {
  const parent = join(root, '.superpowers/native-trial')
  const before = await readdir(parent).catch(() => [])
  for (const [name, text, message] of [
    ['missing-default', 'export const nope = 1', 'default export'],
    ['palette', source.replace("id: 'trial-square'", "skins: [{ id: 'bad', name: 'Bad', palette: { body: 'red' } }], id: 'trial-square'"), 'palette'],
    ['draw', source.replace("id: 'trial-square'", "draw: () => ({width:24,height:24,pixels:[]}), id: 'trial-square'"), 'pixels'],
    ['hat', source.replace("id: 'trial-square'", "hats: ['missing'], id: 'trial-square'"), 'hat'],
    ['throws', 'throw new Error("broken import")', 'broken import'],
  ]) {
    const file = join(scratch, `${name}.ts`); await Bun.write(file, text!)
    const result = await run([file, '--prepare', '--binary', '/does/not/exist'])
    expect(result.exit).not.toBe(0)
    expect(result.stderr).toContain(message!)
  }
  expect(await readdir(parent).catch(() => [])).toEqual(before)
})

test('noisy import and draw diagnostics reach stderr while prepare stdout stays one JSON document', async () => {
  const file = join(scratch, 'noisy candidate.ts')
  await Bun.write(file, String.raw`import { writeSync } from 'node:fs';
console.log('candidate import log'); console.error('candidate error diagnostic');
process.stdout.write('candidate stdout write\n'); writeSync(1, 'candidate fd1 write\n');
await Bun.write(Bun.stdout, 'candidate Bun stdout\n');
setTimeout(() => console.log('candidate deferred log'), 10);
` + source.replace('export default', 'const character =') + `;
let logged = false;
export default { ...character, draw(pose, skin) {
  if (!logged) { console.log('candidate draw log'); logged = true }
  return character.draw(pose, skin)
} }`)
  const result = await run([file, '--prepare'])
  // Recover only the cleanup path if the regression corrupts stdout before/after JSON.
  const start = result.stdout.indexOf('{\n  "directory":')
  const artifact = start >= 0 ? JSON.parse(result.stdout.slice(start, result.stdout.lastIndexOf('\n}') + 2)) : undefined
  try {
    expect(result.exit, result.stderr).toBe(0)
    const trial = JSON.parse(result.stdout)
    expect(trial.character).toBe('trial-square')
    expect(trial.cleanup).toContain(trial.directory)
    expect(await Bun.file(join(trial.directory, 'trial.json')).json()).toEqual(trial)
    for (const diagnostic of ['import log', 'error diagnostic', 'stdout write', 'fd1 write', 'Bun stdout', 'deferred log', 'draw log']) {
      expect(result.stderr).toContain(`candidate ${diagnostic}`)
    }
  } finally { if (artifact) await rm(artifact.directory, { recursive: true, force: true }) }
})

test.each([
  ['import', `console.log('before import failure'); throw new Error('noisy import failed')`, 'noisy import failed'],
  ['draw', source.replace("id: 'trial-square'", "draw: () => { process.stdout.write('before draw failure'); throw new Error('noisy draw failed') }, id: 'trial-square'"), 'noisy draw failed'],
  ['early exit', `console.log('before early exit'); process.exit(0)`, 'validation'],
  ['nonzero exit', `console.log('before nonzero exit'); process.exitCode = 9;\n` + source, 'validation'],
  ['deferred', `setTimeout(() => { console.log('before deferred failure'); throw new Error('deferred candidate failed') }, 20);\n` + source, 'deferred candidate failed'],
])('noisy %s failure emits diagnostics with no success metadata or retained trial', async (name, text, error) => {
  const parent = join(root, '.superpowers/native-trial')
  const before = await readdir(parent).catch(() => [])
  const file = join(scratch, `noisy ${name}.ts`); await Bun.write(file, text!)
  const result = await run([file, '--prepare'])
  const start = result.stdout.indexOf('{\n  "directory":')
  const artifact = start >= 0 ? JSON.parse(result.stdout.slice(start, result.stdout.lastIndexOf('\n}') + 2)) : undefined
  try {
    expect(result.exit).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(`before ${name}`)
    expect(result.stderr).toContain(error!)
    expect(result.stderr).not.toContain('Pals temporary visual mode')
    expect(await readdir(parent).catch(() => [])).toEqual(before)
  } finally { if (artifact) await rm(artifact.directory, { recursive: true, force: true }) }
})

test.each([0, 7])('interactive child inherits stdio and isolated cwd/env; exit %i removes trial', async code => {
  const binary = join(scratch, 'fake opencode')
  await Bun.write(binary, `#!${process.execPath}\nconsole.error('child-isolated=' + (process.cwd() !== ${JSON.stringify(scratch)} && !process.env.OPENAI_API_KEY)); process.exit(${code})\n`)
  await chmod(binary, 0o755)
  const result = await run([candidate, '--binary', binary])
  expect(result.exit, result.stderr).toBe(code)
  expect(result.stderr).toContain('child-isolated=true')
  const trial = JSON.parse(result.stdout)
  expect(await Bun.file(trial.entry).exists()).toBe(false)
  expect(await readdir(trial.directory).catch(() => null)).toBeNull()
})

test('trial module can supply a custom hat without registering it in production', async () => {
  const file = join(scratch, 'trial with hat.ts')
  await Bun.write(file, source.replace('export default', 'const character =') + `;
export default { character: { ...character, hats: ['trial-cap'], defaults: { skin: 'sky-blue', hat: 'trial-cap' } },
  hats: [{id: 'trial-cap', name: 'Trial cap', draw: () => ({width: 24, height: 24, pixels: Array(576).fill(null)})}] }`)
  const result = await run([file, '--prepare'])
  expect(result.exit, result.stderr).toBe(0)
  const trial = JSON.parse(result.stdout)
  try {
    const kv = await Bun.file(join(trial.environment.XDG_STATE_HOME, 'opencode/kv.json')).json()
    expect(kv[ 'opencode-pals.preferences.v1'].appearances['trial-square'].hat).toBe('trial-cap')
    expect(await Bun.file(catalogPath).text()).toBe(catalogBefore)
  } finally { await rm(trial.directory, { recursive: true, force: true }) }
})

test('SIGTERM bounds shutdown even when a child ignores it, then removes isolated files', async () => {
  const binary = join(scratch, 'waiting opencode')
  const ready = join(scratch, 'child ready.json')
  await Bun.write(binary, `#!${process.execPath}\nprocess.on('SIGTERM', () => {}); await Bun.write(${JSON.stringify(ready)}, JSON.stringify({cwd:process.cwd(),pid:process.pid})); setInterval(() => {}, 1000)\n`)
  await chmod(binary, 0o755)
  const child = Bun.spawn([process.execPath, join(root, 'scripts/try-pal.ts'), candidate, '--binary', binary], { stdout: 'pipe', stderr: 'pipe' })
  let running: { cwd: string; pid: number } | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    for (let i = 0; i < 100 && !await Bun.file(ready).exists(); i++) await Bun.sleep(50)
    expect(await Bun.file(ready).exists()).toBe(true)
    running = await Bun.file(ready).json()
    child.kill('SIGTERM')
    const exit = await Promise.race([child.exited, new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error('child shutdown was not bounded')), 7000)
    })])
    expect(exit).not.toBe(0)
    expect(await readdir(running!.cwd).catch(() => null)).toBeNull()
    expect(() => process.kill(running!.pid, 0)).toThrow()
  } finally {
    clearTimeout(deadline)
    if (running) { try { process.kill(running.pid, 'SIGKILL') } catch {} }
    child.kill('SIGKILL')
    await child.exited
    if (running) await rm(dirname(running.cwd), { recursive: true, force: true })
  }
}, 10000)
