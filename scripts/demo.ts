import { watch } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { ensureServer, findCompanion, openBrowser, publishScreen, serverReady, type ServerInfo } from './companion'

const projectRoot = resolve(import.meta.dir, '..')
export function inlineScript(source: string): string { return source.replace(/<\/script/gi, match => match.replace('/', '\\/')) }
export async function buildScreen(): Promise<string> {
  const result = await Bun.build({ entrypoints: [join(projectRoot, 'demo/browser.ts')], target: 'browser', format: 'iife', minify: false })
  if (!result.success) throw new Error(result.logs.join('\n'))
  const template = await Bun.file(join(projectRoot, 'demo/template.html')).text()
  const source = await result.outputs[0].text()
  return template.replace('<!-- BROWSER -->', () => `<script>${inlineScript(source)}</script>`)
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--')
  let explicit: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--superpowers-dir') {
      explicit = args[++i]
      if (!explicit || explicit.startsWith('--')) throw new Error('--superpowers-dir requires a package root or brainstorming skill directory')
    } else if (!['--open', '--stop', '--events'].includes(args[i])) throw new Error(`Unknown demo option: ${args[i]}`)
  }
  if (args.includes('--stop') && args.includes('--events')) throw new Error('Choose --stop or --events')
  const metadata = join(projectRoot, '.superpowers/demo/session.json')
  let saved: { info: ServerInfo; launcher: string } | undefined
  if (await Bun.file(metadata).exists()) saved = await Bun.file(metadata).json()
  if (args.includes('--events')) {
    if (!saved) throw new Error('No demo session. Run bun run demo -- --open first.')
    const events = Bun.file(join(saved.info.state_dir, 'events'))
    console.log(await events.exists() ? await events.text() : 'No selections recorded for the current screen.')
    return
  }
  if (args.includes('--stop')) {
    if (!saved) throw new Error('No demo session. Run bun run demo -- --open first.')
    const child = Bun.spawn(['bash', join(dirname(saved.launcher), 'stop-server.sh'), dirname(saved.info.state_dir)], { stdout: 'inherit', stderr: 'inherit' })
    if (await child.exited !== 0) throw new Error('Companion stop failed')
    return
  }
  const launcher = await findCompanion(explicit)
  let info = saved?.info
  await mkdir(dirname(metadata), { recursive: true })
  let initial = true
  const publish = async () => {
    const html = await buildScreen()
    const reopen = initial && args.includes('--open') && info && await serverReady(info)
    info = await ensureServer(info, launcher, projectRoot, args.includes('--open'))
    const temporary = `${metadata}.${process.pid}.tmp`
    try {
      await Bun.write(temporary, JSON.stringify({ info, launcher }, null, 2), { mode: 0o600 })
      await rename(temporary, metadata)
    } finally { await rm(temporary, { force: true }) }
    console.log(`Screen: ${await publishScreen(info, html)}\nURL: ${info.url}\nState: ${info.state_dir}\nEvents: ${join(info.state_dir, 'events')}`)
    initial = false
    if (reopen) {
      try { await openBrowser(info.url) }
      catch (error) { console.error(`Demo browser opener failed: ${(error as Error).message}. Watching continues; use the printed URL.`) }
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve()
  let stopping = false
  const watchers: ReturnType<typeof watch>[] = []
  const close = async () => {
    if (stopping) return
    stopping = true
    clearTimeout(timer)
    watchers.forEach(w => w.close())
    // Retain signal handlers during draining: repeated signals must not interrupt writes.
    // Let the event loop exit naturally after the active launcher/publication settles.
    await queue.catch(() => {}) // Initial errors are handled by main; rebuilds report below.
  }
  process.on('SIGINT', close); process.on('SIGTERM', close)
  const changed = () => {
    if (stopping) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      queue = queue.then(() => { if (!stopping) return publish() })
        .catch(error => console.error(`Demo rebuild failed: ${error.message}`))
    }, 180)
  }
  try {
    queue = publish()
    await queue
    if (stopping) return
    for (const path of ['src/art', 'demo', 'src/tui/placement.ts']) watchers.push(watch(join(projectRoot, path), { recursive: true }, changed))
    console.log('Watching src/art/ and demo/. Ctrl-C drains active work and ends watching; bun run demo -- --stop stops the companion.')
  } catch (error) {
    await close()
    throw error
  }
}

if (import.meta.main) main().catch(error => { console.error(error.message); process.exitCode = 1 })
