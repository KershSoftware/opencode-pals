// Verify captured HOST framebuffer pixels, independently of the encoder.
import assert from 'node:assert/strict'
import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'

type Color = { buffer: Record<string, number> }
type Span = { text: string; fg: Color; bg: Color; width: number }
type Capture = { width: number; height: number; lines: { spans: Span[] }[] }
const hex = (color: Color) => '#' + [0, 1, 2].map(i => color.buffer[i]!.toString(16).padStart(2, '0')).join('')
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

for (const mood of ['working', 'thinking'] as const) {
  const directory = `.superpowers/native-smoke/${mood}`
  const capture: Capture = await Bun.file(`${directory}/decorated.json`).json()
  const rows = capture.lines.map(line => line.spans.flatMap(span => [...span.text].map(char => ({ char, fg: hex(span.fg), bg: hex(span.bg) }))))
  const labelRow = rows.findIndex(row => row.map(cell => cell.char).join('').includes(`Jelly static: ${mood}`))
  assert(labelRow >= 12, 'sprite/label absent')
  const x = rows[labelRow]!.map(cell => cell.char).join('').indexOf('Jelly static:')
  const y = labelRow - 12
  const frame = compose(catalog, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 0, false)
  const background = rows[y]![x - 1]!.bg
  for (let py = 0; py < 24; py++) {
    for (let px = 0; px < 24; px++) {
      const cell = rows[y + Math.floor(py / 2)]![x + px]!
      assert.equal(cell.char, '▀', `${mood}: missing cell at ${px},${py}`)
      assert.equal(py % 2 ? cell.bg : cell.fg, frame.pixels[py * 24 + px] ?? background, `${mood}: wrong pixel at ${px},${py}`)
    }
  }
  const sidebarBlocks = rows.flatMap((row, ry) => row.flatMap((cell, rx) => rx >= capture.width - 42 && cell.char === '▀' ? [[rx, ry]] : []))
  assert.equal(sidebarBlocks.length, 288, 'clipped, wrapped, or duplicate sprite')
  assert.equal(Math.min(...sidebarBlocks.map(p => p[0]!)), x)
  assert.equal(Math.max(...sidebarBlocks.map(p => p[0]!)), x + 23)
  assert.equal(Math.min(...sidebarBlocks.map(p => p[1]!)), y)
  assert.equal(Math.max(...sidebarBlocks.map(p => p[1]!)), y + 11)
  const summary = { mood, terminal: [capture.width, capture.height], sprite: { x, y, columns: 24, rows: 12 }, verifiedPixels: 576, background }
  await Bun.write(`${directory}/pixels.json`, JSON.stringify(summary, null, 2))
  // Review aid reconstructed FROM native spans; not a screenshot of the user's font.
  const svg: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><title>Native ${mood} framebuffer reconstruction (8x16 cells)</title>`]
  rows.forEach((row, ry) => row.forEach((cell, rx) => {
    svg.push(`<rect x="${rx * 8}" y="${ry * 16}" width="8" height="16" fill="${cell.bg}"/>`)
    if (cell.char === '▀') svg.push(`<rect x="${rx * 8}" y="${ry * 16}" width="8" height="8" fill="${cell.fg}"/>`)
    else if (cell.char !== ' ') svg.push(`<text x="${rx * 8}" y="${ry * 16 + 13}" font-family="monospace" font-size="13" fill="${cell.fg}">${escape(cell.char)}</text>`)
  }))
  svg.push('</svg>')
  await Bun.write(`${directory}/native-frame.svg`, svg.join('\n'))
  console.log(JSON.stringify(summary))
}
