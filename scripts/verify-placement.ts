// Independent original-art vs installed-host framebuffer verification.
import assert from 'node:assert/strict'
import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'

type Color = { buffer: Record<string, number> }
type Capture = { width: number; height: number; lines: { spans: { text: string; fg: Color; bg: Color }[] }[];
  tree: { id: string; x: number; y: number; width: number; height: number }[] }
const hex = (color: Color) => '#' + [0, 1, 2].map(i => color.buffer[i]!.toString(16).padStart(2, '0')).join('')
for (const mood of ['working', 'thinking'] as const) {
  const directory = `.superpowers/native-smoke/placement-${mood}`
  const result = await Bun.file(`${directory}/result.json`).json()
  assert(result.ok && result.providerCount === 0 && result.messageCount === 0)
  const proxy = await Bun.file(`${directory}/proxy.json`).json()
  const posts = (proxy.requests as [string, string][]).filter(([method]) => method === 'POST')
  assert.equal(posts.length, 2, 'only empty parent/child session creation is expected')
  assert(posts.every(([, url]) => url.split('?')[0] === '/session'), 'unexpected submission/command/model request')
  const frame = compose(catalog, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 0, false)
  const palette = new Set(frame.pixels.filter(pixel => pixel !== null))
  const opaque = frame.pixels.filter(pixel => pixel !== null).length
  const summaries = []
  for (const name of ['home', 'prompt', 'sidebar', 'narrow-manual-sidebar', 'permission', 'question', 'waiting-cold-entry']) {
    const capture: Capture = await Bun.file(`${directory}/${name}.json`).json()
    const rows = capture.lines.map(line => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: hex(span.fg), bg: hex(span.bg) }))))
    const pets = capture.tree.filter(node => node.id.startsWith('jelly-pet-'))
    assert.equal(pets.length, 1, `${name}: one mounted pet`)
    const pet = pets[0]!
    const prompt = pet.id === 'jelly-pet-prompt'
    const sidebar = pet.id === 'jelly-pet-sidebar'
    const x = pet.x
    const y = pet.y + (prompt ? 0 : 1)
    const height = prompt ? 26 : 24
    const app = rows[0]![0]!.bg
    const panel = rows[y + Math.floor((height - 1) / 2)]![x - 1]!.bg
    const background = sidebar ? rows[y]![x + 18]!.bg : app
    for (let py = 0; py < height; py++) for (let px = 3; px <= 20; px++) {
      const sourceY = py - (prompt ? 1 : 0)
      const pixel = sourceY >= 0 && sourceY < 24 ? frame.pixels[sourceY * 24 + px] : null
      const cell = rows[y + Math.floor(py / 2)]![x + px - 3]!
      assert.equal(cell.char, '▀', `${name}: missing cell`)
      assert.equal(py % 2 ? cell.bg : cell.fg, pixel ?? (prompt && py >= 24 ? panel : background), `${name}: pixel ${px},${py}`)
    }
    const opaqueHalves = rows.flat().filter(cell => cell.char === '▀').reduce((sum, cell) => sum + Number(palette.has(cell.fg)) + Number(palette.has(cell.bg)), 0)
    assert.equal(opaqueHalves, opaque, `${name}: duplicate/clipped opaque art`)
    summaries.push({ name, origin: [x, y], verifiedHalves: 18 * height, opaqueHalves })
  }
  await Bun.write(`${directory}/pixels.json`, JSON.stringify({ mood, summaries, posts, ok: true }, null, 2))
  console.log(JSON.stringify({ mood, captures: summaries.length, verifiedHalves: summaries.reduce((sum, item) => sum + item.verifiedHalves, 0), modelCalls: 0 }))
}
