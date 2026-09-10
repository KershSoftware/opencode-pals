import { constants } from 'node:fs'
import { access, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type ServerInfo = { url: string; screen_dir: string; state_dir: string }

export function parseServerInfo(stdout: string): ServerInfo {
  for (const line of stdout.split(/\r?\n/)) {
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (value?.type !== 'server-started') continue
    if (![value.url, value.screen_dir, value.state_dir].every(v => typeof v === 'string' && v.trim())) break
    try { if (!['http:', 'https:'].includes(new URL(value.url).protocol)) break } catch { break }
    return { url: value.url, screen_dir: value.screen_dir, state_dir: value.state_dir }
  }
  throw new Error('Missing valid server-started JSON with url, screen_dir, and state_dir')
}

export async function findCompanion(explicit?: string): Promise<string> {
  const override = explicit ?? process.env.SUPERPOWERS_DIR
  const home = homedir()
  const candidates = override !== undefined ? [resolve(override.replace(/^~(?=\/)/, home))] : [
    join(process.cwd(), 'node_modules/superpowers'),
    join(home, '.config/opencode/node_modules/superpowers'),
    join(home, '.config/opencode/superpowers'),
    join(home, '.config/opencode/skills/superpowers/brainstorming'),
    join(home, '.agents/skills/superpowers/brainstorming'),
    join(home, '.agents/skills/brainstorming'),
    join(home, '.claude/skills/brainstorming'),
  ]
  if (override === undefined) {
    const cache = join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'opencode/packages')
    try {
      for await (const path of new Bun.Glob('**/node_modules/superpowers/skills/brainstorming/scripts/start-server.sh').scan({ cwd: cache, absolute: true })) candidates.push(resolve(path, '../..'))
    } catch { /* Cache may not exist on other installations. */ }
  }
  for (const root of candidates) {
    for (const launcher of [join(root, 'skills/brainstorming/scripts/start-server.sh'), join(root, 'scripts/start-server.sh')]) {
      try { await access(launcher, constants.R_OK); return launcher } catch { /* Try next documented location. */ }
    }
  }
  throw new Error(`Missing Superpowers visual companion prerequisite: brainstorming/scripts/start-server.sh${override !== undefined ? ` under ${override}` : ''}. Install Superpowers, or use bun run demo -- --superpowers-dir "/path/to/superpowers" (package root or brainstorming skill directory); alternatively set SUPERPOWERS_DIR.`)
}

export async function serverReady(info: ServerInfo): Promise<boolean> {
  if (!await Bun.file(join(info.state_dir, 'server-info')).exists() || await Bun.file(join(info.state_dir, 'server-stopped')).exists()) return false
  try {
    // Probe the full returned URL: the companion requires its session key.
    // Metadata survives SIGKILL/reboots, so file markers alone are insufficient.
    const response = await fetch(info.url, { signal: AbortSignal.timeout(1000), cache: 'no-store' })
    await response.body?.cancel()
    return response.ok
  } catch { return false }
}

export async function openBrowser(url: string): Promise<void> {
  const command = process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['rundll32.exe', 'url.dll,FileProtocolHandler', url]
    : ['xdg-open', url]
  const child = Bun.spawn(command, { stdout: 'ignore', stderr: 'pipe' })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`Browser opener exited ${code}: ${stderr.trim()}. Open ${url}`)
}

export async function ensureServer(info: ServerInfo | undefined, launcher: string, projectRoot: string, open = false): Promise<ServerInfo> {
  if (info && await serverReady(info)) return info
  // A terminal Ctrl-C reaches the watcher's process group. Give the launcher its
  // own group so it can finish returning session metadata while the watcher drains.
  const child = Bun.spawn(['bash', launcher, '--project-dir', projectRoot, ...(open ? ['--open'] : [])], { stdout: 'pipe', stderr: 'pipe', detached: true })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error(`Companion launcher exited ${code}: ${stdout}${stderr}`)
  const started = parseServerInfo(stdout)
  if (!await serverReady(started)) throw new Error('Companion unreachable, stopped or missing server-info after startup')
  return started
}

let revision = 0
export async function publishScreen(info: ServerInfo, html: string): Promise<string> {
  if (!await serverReady(info)) throw new Error('Companion unreachable, stopped or missing server-info; restart through the launcher before publishing')
  for (;;) {
    const path = join(info.screen_dir, `pals-${Date.now()}-${++revision}.html`)
    let file
    try { file = await open(path, 'wx', 0o600) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    try { await file.writeFile(html) } finally { await file.close() }
    return path
  }
}
