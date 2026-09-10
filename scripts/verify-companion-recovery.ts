import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { ensureServer, findCompanion, publishScreen, serverReady, type ServerInfo } from './companion'

// Isolated project session: never stop or rewrite the user's design companion.
const root = await mkdtemp(join(tmpdir(), 'pals-recovery-'))
const launcher = await findCompanion()
const sessions: ServerInfo[] = []
try {
  const original = await ensureServer(undefined, launcher, root); sessions.push(original)
  assert(await serverReady(original))
  const pid = Number(await Bun.file(join(original.state_dir, 'server.pid')).text())
  assert(Number.isSafeInteger(pid) && pid > 1)
  process.kill(pid, 'SIGKILL')
  for (let i = 0; i < 30 && await serverReady(original); i++) await Bun.sleep(50)
  assert(await Bun.file(join(original.state_dir, 'server-info')).exists())
  assert(!await Bun.file(join(original.state_dir, 'server-stopped')).exists())
  assert(!await serverReady(original))
  const recovered = await ensureServer(original, launcher, root); sessions.push(recovered)
  assert.notEqual(recovered.state_dir, original.state_dir)
  assert.equal(recovered.url, original.url, 'supported launcher preserves project port and session key')
  const screen = await publishScreen(recovered, '<!DOCTYPE html><html><body>FINAL-FIX-RECOVERY</body></html>')
  const url = new URL(recovered.url); url.pathname = `/files/${basename(screen)}`
  const response = await fetch(url)
  assert(response.ok); assert((await response.text()).includes('FINAL-FIX-RECOVERY'))
  console.log(JSON.stringify({ ok: true, abruptKill: true, staleMarkersRejected: true, relaunched: true,
    fullURLPreserved: true, recoveredScreenHTTP: response.status, root }))
} finally {
  for (const info of sessions.reverse()) {
    const child = Bun.spawn(['bash', join(dirname(launcher), 'stop-server.sh'), dirname(info.state_dir)], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    assert.equal(code, 0, `${stdout}${stderr}`)
    assert(!await serverReady(info))
  }
  console.log('Companion recovery cleanup: all test sessions stopped')
}
