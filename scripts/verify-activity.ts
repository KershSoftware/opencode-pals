import assert from 'node:assert/strict'
import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import type { Mood } from '../src/art/types'

const directory = '.superpowers/native-smoke/activity'
const result = await Bun.file(`${directory}/result.json`).json()
const proxy = await Bun.file(`${directory}/proxy.json`).json()
const process = await Bun.file(`${directory}/process.json`).json()
assert(result.ok && result.version === '1.18.30' && result.providerCount === 0 && result.persistedMessageCount === 0)
assert(result.lifecycleCleanup && result.slotErrors.length === 0)
assert.equal(result.ticks, 10)
const posts = (proxy.requests as [string, string][]).filter(([method]) => method === 'POST')
assert.equal(posts.length, 3)
assert(posts.every(([, url]) => url.split('?')[0] === '/session'), 'Only three empty session creations; no model/tool/command submissions')
assert.equal(proxy.requests.filter(([method]: [string]) => method === 'DELETE').length, 3)
assert.notEqual(process.exit, null); assert.notEqual(proxy.serverExit, null)
const expected: Record<string, Mood> = {
  home: 'idle', baseline: 'idle', 'paused-narrow': 'idle', 'paused-resize-restored': 'idle',
  'manual-narrow-sidebar': 'idle', 'manual-narrow-hidden': 'idle',
  'reactivated-immediate-prompt': 'idle', 'reactivated-immediate-sidebar': 'idle', 'reactivated-immediate-home': 'idle',
  thinking: 'thinking', tools: 'working', 'thinking-again': 'thinking', 'moving-perch': 'thinking',
  'evicted-user-tools': 'working', 'route-duplicate-error': 'idle', 'route-duplicate-abort': 'idle',
  'reenable-duplicate-error': 'idle', 'reenable-duplicate-abort': 'idle',
  completion: 'done', 'completion-expired': 'idle', 'kv-reenabled-baseline': 'idle',
  permission: 'waiting', 'permission-cleared': 'thinking', 'child-question': 'waiting', 'deferred-error': 'waiting',
  error: 'error', 'duplicate-busy': 'error', retry: 'error', recovery: 'thinking', interrupt: 'interrupted',
  'interrupt-expired': 'idle', 'other-session': 'idle', 'return-baseline': 'idle', 'return-home': 'idle', 'reactivated-baseline': 'idle',
}
type Color = { buffer: Record<string, number> }
const hex = (c: Color) => '#' + [0, 1, 2].map(i => c.buffer[i]!.toString(16).padStart(2, '0')).join('')
let halves = 0
for (const [name, mood] of Object.entries(expected)) {
  const capture = await Bun.file(`${directory}/${name}.json`).json()
  const pets = capture.tree.filter((n: { id: string }) => n.id.startsWith('jelly-pet-'))
  assert.equal(pets.length, 1)
  const pet = pets[0]
  const prompt = pet.id === 'jelly-pet-prompt'
  const sidebar = pet.id === 'jelly-pet-sidebar'
  const y = pet.y + (prompt ? 0 : 1)
  const rows = capture.lines.map((line: { spans: { text: string; fg: Color; bg: Color }[] }) => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: hex(span.fg), bg: hex(span.bg) }))))
  const frame = compose(catalog, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 0, false)
  for (let py = 0; py < (prompt ? 18 : 16); py++) for (let px = 2; px <= 15; px++) {
    const sy = py - (prompt ? 1 : 0)
    const color = sy >= 0 && sy < 16 ? frame.pixels[sy * 24 + px] : null
    const background = sidebar ? '#141414' : prompt && py >= 16 ? '#1e1e1e' : '#0a0a0a'
    const cell = rows[y + Math.floor(py / 2)][pet.x + px - 2]
    assert.equal(cell.char, '▀', `${name}: missing cell`)
    assert.equal(py % 2 ? cell.bg : cell.fg, color ?? background, `${name}: source ${px},${py}`)
    halves++
  }
  const palette = new Set(frame.pixels.filter(p => p !== null))
  const opaqueHalves = rows.flat().filter((c: { char: string }) => c.char === '▀').reduce((n: number, c: { fg: string; bg: string }) => n + Number(palette.has(c.fg)) + Number(palette.has(c.bg)), 0)
  assert.equal(opaqueHalves, frame.pixels.filter(p => p !== null).length, `${name}: extra or missing opaque sprite pixels`)
}
const audit = { ok: true, captures: Object.keys(expected).length, verifiedPixelHalves: halves, posts, modelCalls: 0, ticks: result.ticks,
  lifecycleCleanup: result.lifecycleCleanup, immediateReactivationVisible: result.immediateReactivationVisible, tuiExit: process.exit, serverExit: proxy.serverExit }
await Bun.write(`${directory}/audit.json`, JSON.stringify(audit, null, 2))
console.log(JSON.stringify(audit, null, 2))
