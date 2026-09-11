import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
import { loadTrial } from './load-trial'
import { preferenceKey } from '../src/state/preferences'

const root = resolve(import.meta.dir, '..')
const help = `Usage: bun run try:pal -- ./path/to/character.ts [--prepare | --build-only] [--binary /path/to/opencode]

Default export: Character or { character: Character, hats?: Hat[] } (PalTrial).
Runs installed OpenCode with interactive stdio and a temporary HOME/XDG/cwd.
No providers, global install, catalog edits or real preferences. Trusted local TS/JS only.
/pals selects character/skin/hat; /pals-trial forces moods and opens home/sidebar.
--prepare (alias --build-only) builds without launching; prints JSON entry/config/cwd/env
and cleanup command. Files persist in ignored .superpowers/native-trial/.
Interactive trials are removed on exit. Quit and rerun after editing your module.
--help shows this help without building or launching.
`
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--')
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0 }
  let prepare = false; let binary: string | undefined; let file: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--prepare' || arg === '--build-only') prepare = true
    else if (arg === '--binary') { binary = args[++i]; if (!binary || binary.startsWith('--')) throw new Error('--binary requires an executable path') }
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}\n${help}`)
    else if (file) throw new Error('Pass exactly one trial module')
    else file = resolve(arg)
  }
  if (!file) throw new Error(help)
  const sourceHash = createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')
  // Validate before creating a trial; candidate stdout/stderr goes to stderr.
  const trial = await loadTrial(file)
  const installed = binary ? Bun.which(binary) : Bun.which('opencode') ?? Bun.which(join(homedir(), '.opencode/bin/opencode'))
  if (!prepare && !installed) throw new Error('Installed OpenCode not found; use --binary /path/to/opencode or --prepare')
  const parent = prepare ? join(root, '.superpowers/native-trial') : tmpdir()
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'pals-'))
  let keep = false
  let child: ReturnType<typeof Bun.spawn> | undefined
  let signal: NodeJS.Signals | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const stop = (name: NodeJS.Signals) => {
    signal = name; child?.kill(name)
    if (child && !deadline) deadline = setTimeout(() => child?.kill('SIGKILL'), 5000)
  }
  const interrupt = () => stop('SIGINT'); const terminate = () => stop('SIGTERM')
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
  try {
    for (const name of ['home', 'config', 'data', 'cache', 'state/opencode', 'tmp', 'cwd']) await mkdir(join(directory, name), { recursive: true })
    const source = join(directory, 'entry.tsx')
    await Bun.write(source, `import value from ${JSON.stringify(file)}\nimport { trialPlugin } from ${JSON.stringify(join(root, 'scripts/trial-entry.tsx'))}\nexport default trialPlugin('character' in value ? value : { character: value })\n`)
    const result = await Bun.build({ entrypoints: [source], outdir: directory, target: 'bun', format: 'esm',
      plugins: [createSolidTransformPlugin()], external: ['solid-js', 'solid-js/*', '@opentui/*', '@opencode-ai/*'], metafile: true })
    if (!result.success) throw new AggregateError(result.logs, 'Trial TUI build failed')
    const bundledHost = Object.keys(result.metafile!.inputs).filter(p => /node_modules\/(solid-js|@opentui|@opencode-ai)\//.test(p))
    if (bundledHost.length) throw new Error(`Bundled host runtimes: ${bundledHost.join(', ')}`)
    const entry = result.outputs[0]!.path
    await Bun.write(join(directory, 'metafile.json'), JSON.stringify(result.metafile, null, 2))
    const config = join(directory, 'opencode.json'); const tuiConfig = join(directory, 'tui.json')
    await Bun.write(config, JSON.stringify({ $schema: 'https://opencode.ai/config.json', enabled_providers: [],
      autoupdate: false, share: 'disabled', plugin: [], mcp: {} }, null, 2))
    await Bun.write(tuiConfig, JSON.stringify({ $schema: 'https://opencode.ai/tui.json', theme: 'opencode', plugin: [pathToFileURL(entry).href] }, null, 2))
    await Bun.write(join(directory, 'state/opencode/kv.json'), JSON.stringify({ [preferenceKey]: trial.preferences, dismissed_getting_started: true }))
    // Allowlist rather than inheriting provider credentials, config overrides or preload hooks.
    const environment: Record<string, string> = { PATH: process.env.PATH ?? '',
      TERM: process.env.TERM ?? 'xterm-256color', COLORTERM: process.env.COLORTERM ?? 'truecolor', LANG: process.env.LANG ?? 'en_US.UTF-8',
      HOME: join(directory, 'home'), OPENCODE_TEST_HOME: join(directory, 'home'), TMPDIR: join(directory, 'tmp'),
      OPENCODE_CONFIG: config, OPENCODE_TUI_CONFIG: tuiConfig, OPENCODE_DISABLE_PROJECT_CONFIG: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
      OPENCODE_DISABLE_EXTERNAL_SKILLS: '1', OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1', OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: '1',
      ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => [`XDG_${n.toUpperCase()}_HOME`, join(directory, n)])),
    }
    const cwd = join(directory, 'cwd')
    const manifest = { directory, entry, config, tuiConfig, cwd, environment, character: trial.character,
      characterName: trial.characterName, bounds: trial.bounds, source: file, sourceHash,
      binary: installed, cleanup: `rm -rf -- ${quote(directory)}` }
    await Bun.write(join(directory, 'trial.json'), JSON.stringify(manifest, null, 2))
    if (signal) return signal === 'SIGINT' ? 130 : 143
    console.log(JSON.stringify(manifest, null, 2))
    console.error('Pals temporary visual mode: no model providers. /pals selects appearance; /pals-trial selects mood/home/sidebar.')
    if (prepare) { keep = true; return 0 }
    console.error('Quit OpenCode to remove this trial. Rerun this command after edits.')
    child = Bun.spawn([installed!], { cwd, env: environment, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
    return await child.exited
  } finally {
    clearTimeout(deadline)
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
    if (!keep) await rm(directory, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try { process.exitCode = await main() }
  catch (error) { console.error(`Pals trial failed: ${error instanceof AggregateError ? `${error.message}: ${error.errors.join('\n')}` : error instanceof Error ? error.message : error}`); process.exitCode = 1 }
}
