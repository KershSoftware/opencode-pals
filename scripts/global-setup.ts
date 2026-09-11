// Only manages the copied Pals TUI entry, never server plugins or host preferences.
import { lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyEdits, createScanner, findNodeAtLocation, getNodeValue, modify, parseTree, SyntaxKind, type Edit, type Node, type ParseError } from 'jsonc-parser'

const help = `OpenCode Pals global setup

  opencode-pals install
  opencode-pals uninstall
  opencode-pals --help
  npx opencode-pals@latest <install|uninstall>

Source checkout (Bun 1.3.13):
  bun run install:global [--help]
  bun run uninstall:global [--help]
  bun /path/to/opencode-pals/scripts/global-setup.ts <install|uninstall> [--help]

Install/update: source users first run bun run build; npm includes the build.
Copies this package's dist/index.js to
$XDG_CONFIG_HOME/opencode/pals/index.js (default: ~/.config/opencode/pals/index.js).
The copy survives moving/deleting the checkout. Uninstall needs no build.
Both tui.json and tui.jsonc are validated; existing exact file-URL entries and
their options are retained. New entries go in tui.jsonc if present, else tui.json.
Uninstall removes that exact URL from both files and only our marked artifacts.
The manifest preserves original plugin keys/empty overrides across updates.
Cleared plugin keys restore original empty overrides or retain nested shadowing.
Both global files are checked together to preserve unrelated plugin activation.
Only helper-created directories are removed when empty.
Setup refuses changes it cannot safely undo; uninstall refuses conflicting precedence.
Comments, unrelated plugins/settings, and Pals preferences are preserved.
An unowned index.js or symlink at a managed path is an error, never overwritten.
XDG_CONFIG_HOME must be absolute when set. No flags other than --help/-h.
OPENCODE_TUI_CONFIG / OPENCODE_CONFIG_DIR and project configs are not edited.
The checkout's local tui.json still enables Pals after global uninstall.
Quit and restart OpenCode after install, update, or uninstall.
`
const markerText = 'opencode-pals global install v1\n'
type Spec = string | [string, Record<string, unknown>]
type Config = { file: string; text: string; next: string; arrays: { path: string[]; specs: Spec[] }[]; active: string[] }
type Origin = { file: string; path: string[]; state: 'absent' | 'empty' | 'nonempty' }
type Manifest = { owner: 'opencode-pals'; version: 2; directoryCreated: boolean; arrays: Origin[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const specURL = (spec: Spec) => typeof spec === 'string' ? spec : spec[0]
const samePath = (a: string[], b: string[]) => a.join('.') === b.join('.')

function manifestFrom(text: string, file: string): Manifest {
  // v1 cannot prove directory creation or an originally-empty override. Keep its
  // directory and let the effective-config check decide how to clear its arrays.
  if (text === markerText) return { owner: 'opencode-pals', version: 2, directoryCreated: false, arrays: [] }
  const errors: ParseError[] = [], tree = parseTree(text, errors)
  if (!tree || errors.length) throw new Error(`Invalid Pals manifest: ${file}`)
  uniqueKeys(tree, file)
  const value = getNodeValue(tree)
  if (!record(value) || value.owner !== 'opencode-pals' || value.version !== 2 || typeof value.directoryCreated !== 'boolean' ||
      !Array.isArray(value.arrays) || !value.arrays.every((item: unknown) => record(item) &&
        ['tui.json', 'tui.jsonc'].includes(String(item.file)) && Array.isArray(item.path) &&
        ['["plugin"]', '["tui","plugin"]'].includes(JSON.stringify(item.path)) &&
        ['absent', 'empty', 'nonempty'].includes(String(item.state)))) throw new Error(`Invalid Pals manifest: ${file}`)
  const result = value as Manifest
  if (new Set(result.arrays.map(item => `${item.file}:${item.path.join('.')}`)).size !== result.arrays.length)
    throw new Error(`Duplicate Pals manifest origins: ${file}`)
  return result
}
function origin(manifest: Manifest, cfg: Config, path: string[]) {
  return manifest.arrays.find(item => item.file === basename(cfg.file) && samePath(item.path, path))
}
function remember(manifest: Manifest, cfg: Config, path: string[], specs?: Spec[]) {
  if (!origin(manifest, cfg, path)) manifest.arrays.push({ file: basename(cfg.file), path,
    state: specs === undefined ? 'absent' : specs.length ? 'nonempty' : 'empty' })
}

async function stat(path: string) {
  try { return await lstat(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function regular(path: string, directory = false) {
  const info = await stat(path)
  if (info && (info.isSymbolicLink() || !(directory ? info.isDirectory() : info.isFile())))
    throw new Error(`Expected a regular ${directory ? 'directory' : 'file'} (no symlink): ${path}`)
  return info
}
function uniqueKeys(node: Node, file: string) {
  if (node.type === 'object') {
    const keys = node.children!.map(child => child.children![0].value)
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate JSON keys: ${file}`)
  }
  for (const child of node.children ?? []) uniqueKeys(child, file)
}
async function config(file: string): Promise<Config | undefined> {
  if (!await regular(file)) return
  return parseConfig(file, await readFile(file, 'utf8'))
}
function parseConfig(file: string, text: string): Config {
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (!tree || errors.length || tree.type !== 'object') throw new Error(`Malformed JSON/JSONC object: ${file}`)
  uniqueKeys(tree, file)
  const value = getNodeValue(tree) as Record<string, unknown>
  const arrays: Config['arrays'] = []
  const add = (value: Record<string, unknown>, path: string[]) => {
    if (!('plugin' in value)) return
    const specs = value.plugin
    if (!Array.isArray(specs) || !specs.every(spec => typeof spec === 'string' ||
      (Array.isArray(spec) && spec.length === 2 && typeof spec[0] === 'string' && record(spec[1]))))
      throw new Error(`Invalid plugin array: ${file}`)
    arrays.push({ path: [...path, 'plugin'], specs })
  }
  add(value, [])
  if (record(value.tui)) add(value.tui, ['tui'])
  // 1.18.30 flattens nested tui, with top-level fields taking precedence.
  const active = !('plugin' in value) && record(value.tui) && 'plugin' in value.tui ? ['tui', 'plugin'] : ['plugin']
  return { file, text, next: text, arrays, active }
}
function edit(cfg: Config, path: (string | number)[], value: unknown) {
  cfg.next = applyEdits(cfg.next, modify(cfg.next, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: cfg.text.includes('\r\n') ? '\r\n' : '\n' },
  }))
}
// Delete syntax tokens and exactly one separator, never trivia. jsonc-parser.modify
// removes inter-element comments along with separators; those comments are user data.
function remove(cfg: Config, path: (string | number)[]) {
  const tree = parseTree(cfg.next)!
  let node = findNodeAtLocation(tree, path)!
  if (node.parent?.type === 'property') node = node.parent
  const siblings = node.parent!.children!, index = siblings.indexOf(node)
  const end = node.offset + node.length
  const after = siblings[index + 1]?.offset ?? node.parent!.offset + node.parent!.length - 1
  const before = index ? siblings[index - 1].offset + siblings[index - 1].length : node.offset
  const scanner = createScanner(cfg.next, true), edits: Edit[] = []
  let preceding: Edit | undefined, following: Edit | undefined
  for (let kind = scanner.scan(); kind !== SyntaxKind.EOF; kind = scanner.scan()) {
    const offset = scanner.getTokenOffset(), length = scanner.getTokenLength()
    const token = { offset, length, content: '' }
    if (offset >= node.offset && offset < end) edits.push(token)
    else if (kind === SyntaxKind.CommaToken) {
      if (offset >= end && offset < after) following = token
      if (offset >= before && offset < node.offset) preceding = token
    }
  }
  const separator = following ?? preceding
  if (separator) edits.push(separator)
  cfg.next = applyEdits(cfg.next, edits)
}
// Compare ordered effective declarations/options after same-file normalization and
// cross-file empty-array/origin merging. Exact-spec dedup is safe here: both files
// share a resolution directory. We deliberately do not resolve npm aliases or load
// plugins; ambiguous equivalences may be rejected rather than changing user config.
function unrelatedSignature(configs: Config[], url: string) {
  const origins = new Map<string, Spec>()
  let effective: Spec[] = []
  for (const input of configs) {
    const cfg = parseConfig(input.file, input.next)
    const specs = cfg.arrays.find(a => samePath(a.path, cfg.active))?.specs
    if (!specs) continue
    if (!specs.length) { effective = []; continue }
    for (const spec of specs) { origins.delete(specURL(spec)); origins.set(specURL(spec), spec) }
    effective = [...origins.values()]
  }
  return JSON.stringify(effective.filter(spec => specURL(spec) !== url))
}
function planUninstall(input: Config[], manifest: Manifest, url: string, action: string) {
  const configs = input.map(cfg => parseConfig(cfg.file, cfg.next))
  // Original empty overrides are restoration obligations. Everything else should
  // keep its current unrelated effective declarations while losing only Pals.
  const baseline = configs.map(cfg => ({ ...cfg }))
  for (const cfg of baseline) for (const array of cfg.arrays)
    if (origin(manifest, cfg, array.path)?.state === 'empty')
      for (let i = array.specs.length - 1; i >= 0; i--)
        if (specURL(array.specs[i]) === url) remove(cfg, [...array.path, i])
  const wanted = unrelatedSignature(baseline, url)
  const choices = configs.flatMap(cfg => cfg.arrays.filter(a => a.specs.length &&
    a.specs.every(spec => specURL(spec) === url) && origin(manifest, cfg, a.path)?.state !== 'empty')).length
  // At most four arrays (top-level/nested in JSON/JSONC): prefer deletion, then
  // consider retaining [] where needed. Never copy/edit any unrelated plugin.
  for (let mask = 0; mask < 2 ** choices; mask++) {
    const candidate = configs.map(cfg => ({ ...cfg }))
    let choice = 0
    for (const cfg of candidate) for (const array of cfg.arrays) {
      const onlyPals = array.specs.length && array.specs.every(spec => specURL(spec) === url)
      if (onlyPals && origin(manifest, cfg, array.path)?.state !== 'empty' && !(mask & (1 << choice++))) {
        remove(cfg, array.path)
        continue
      }
      for (let i = array.specs.length - 1; i >= 0; i--)
        if (specURL(array.specs[i]) === url) remove(cfg, [...array.path, i])
    }
    if (unrelatedSignature(candidate, url) === wanted) return candidate
  }
  throw new Error(`Cannot ${action}: cannot preserve unrelated plugin activation with owned-entry-only edits. Resolve the nested/lower-file plugin precedence conflict first; no files were changed.`)
}
async function atomic(file: string, data: string | Uint8Array) {
  const mode = (await stat(file))?.mode ?? 0o600
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try { await writeFile(temp, data, { flag: 'wx', mode }); await rename(temp, file) }
  finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
async function main() {
  const args = process.argv.slice(2)
  if ((args.length === 1 && ['--help', '-h'].includes(args[0])) ||
      (args.length === 2 && ['install', 'uninstall'].includes(args[0]) && ['--help', '-h'].includes(args[1]))) {
    console.log(help); return
  }
  if (args.length !== 1 || !['install', 'uninstall'].includes(args[0])) throw new Error('Usage: opencode-pals <install|uninstall> [--help]')
  const install = args[0] === 'install'
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  if (!isAbsolute(base)) throw new Error('XDG_CONFIG_HOME (or HOME) must be absolute')
  const dir = join(base, 'opencode'), owned = join(dir, 'pals'), entry = join(owned, 'index.js')
  const marker = join(owned, '.opencode-pals-install'), url = pathToFileURL(entry).href
  await regular(dir, true)
  const ownedDirectory = await regular(owned, true)
  const artifact = await regular(entry), marked = await regular(marker)
  if (artifact && !marked) throw new Error(`Refusing unowned Pals artifacts: ${owned}`)
  const manifest: Manifest = marked ? manifestFrom(await readFile(marker, 'utf8'), marker) :
    { owner: 'opencode-pals', version: 2, directoryCreated: !ownedDirectory, arrays: [] }
  let configs = (await Promise.all(['tui.json', 'tui.jsonc'].map(name => config(join(dir, name))))).filter((c): c is Config => !!c)
  let build: Buffer | undefined
  if (install) {
    const source = fileURLToPath(new URL('../dist/index.js', import.meta.url))
    if (!await regular(source) || !(build = await readFile(source)).length)
      throw new Error(`Missing or empty build: ${source}. Run bun run build first.`)
    const before = unrelatedSignature(configs, url)
    const activeArrays = configs.flatMap(c => c.arrays.filter(a => a.path.join('.') === c.active.join('.')))
    const existing = activeArrays.flatMap(a => a.specs).findLast(s => specURL(s) === url)
    for (const cfg of configs) for (const array of cfg.arrays) remember(manifest, cfg, array.path, array.specs)
    // In 1.18.30 a later empty array overwrites result.plugin without restoring origins.
    // Re-add the existing tuple to that array so its options survive and Pals loads.
    if (!existing || activeArrays.at(-1)?.specs.length === 0) {
      if (!configs.length) configs.push({ file: join(dir, 'tui.json'), text: '', next: '{\n  "$schema": "https://opencode.ai/tui.json"\n}\n', arrays: [], active: ['plugin'] })
      const target = configs.at(-1)!
      const array = target.arrays.find(a => a.path.join('.') === target.active.join('.'))
      remember(manifest, target, target.active, array?.specs)
      edit(target, array ? [...target.active, -1] : target.active, array ? existing ?? url : [existing ?? url])
    }
    if (unrelatedSignature(configs, url) !== before)
      throw new Error('Cannot install: the edit would change active or suppressed unrelated plugins. Resolve the global TUI override first; no files were changed.')
    // Prove the paired uninstall can restore semantics before installing/updating.
    planUninstall(configs, manifest, url, 'install')
  } else {
    configs = planUninstall(configs, manifest, url, 'uninstall')
  }
  // All input/config/ownership validation and edits finish before the first write.
  for (const cfg of configs) {
    const errors: ParseError[] = []
    parseTree(cfg.next, errors, { allowTrailingComma: true })
    if (errors.length) throw new Error(`Invalid generated JSONC; no files changed: ${cfg.file}`)
  }
  if (install) {
    await mkdir(owned, { recursive: true })
    await atomic(marker, JSON.stringify(manifest, null, 2) + '\n')
    await atomic(entry, build!)
  }
  for (const cfg of configs) if (cfg.next !== cfg.text) await atomic(cfg.file, cfg.next)
  if (!install && marked) {
    if (artifact) await unlink(entry)
    await unlink(marker)
    if (manifest.directoryCreated) await rmdir(owned).catch(error => { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error })
  }
  console.log(`${install ? 'Installed/updated' : 'Uninstalled'} global Pals: ${url}\nQuit and restart OpenCode. The checkout's local tui.json is a separate installation.`)
}
await main().catch(error => { console.error(`Pals: ${error.message}`); process.exitCode = 1 })
