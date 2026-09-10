import { catalog, referenceCatalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { buildScreen } from './demo'
import { ensureServer, findCompanion, publishScreen } from './companion'
import type { Frame, Mood } from '../src/art/types'

const directory = '.superpowers/sdd/2026-09-10-blue-jelly'
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
function art(frame: Frame, scale: number) {
  const bottom = Math.max(...frame.pixels.flatMap((p, i) => p ? [Math.floor(i / 24)] : []))
  return `<svg role="img" aria-label="Static size comparison" width="${24 * scale}" height="${24 * scale}" viewBox="0 0 24 24" shape-rendering="crispEdges"><rect width="24" height="24" fill="#141414"/><g transform="translate(0 ${23 - bottom})">${frame.pixels.map((p, i) => p ? `<rect x="${i % 24}" y="${Math.floor(i / 24)}" width="1" height="1" fill="${p}"/>` : '').join('')}</g></svg>`
}
const comparisons = (scale: number) => (['idle', 'thinking', 'working'] as Mood[]).map(mood => `<div style="display:flex;gap:24px;flex-wrap:wrap">${[referenceCatalog, catalog].map((source, i) => `<section><h3>${i ? 'Production candidate · 14 columns' : 'ORIGINAL reference ONLY · 18 columns'} · ${mood}</h3>${art(compose(source, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 1800, true), scale)}</section>`).join('')}</div>`).join('')
type Color = { buffer: Record<string, number> }
const hex = (c: Color) => '#' + [0, 1, 2].map(i => c.buffer[i]!.toString(16).padStart(2, '0')).join('')
async function capture(name: string, title: string) {
  const c = await Bun.file(`.superpowers/native-smoke/activity/${name}.json`).json()
  let svg = ''
  c.lines.forEach((line: { spans: { text: string; fg: Color; bg: Color }[] }, y: number) => {
    let x = 0
    for (const span of line.spans) for (const char of span.text) {
      svg += `<rect x="${x * 8}" y="${y * 16}" width="8" height="16" fill="${hex(span.bg)}"/>`
      if (['▀', '▄', '█'].includes(char)) svg += `<rect x="${x * 8}" y="${y * 16 + (char === '▄' ? 8 : 0)}" width="8" height="${char === '█' ? 16 : 8}" fill="${hex(span.fg)}"/>`
      else if (char.trim()) svg += `<text x="${x * 8}" y="${y * 16 + 12}" fill="${hex(span.fg)}">${escape(char)}</text>`
      x++
    }
  })
  return `<h3>${title}</h3><div style="overflow:auto"><svg width="${c.width * 8}" height="${c.height * 16}" style="font:13px Menlo,monospace" shape-rendering="crispEdges">${svg}</svg></div>`
}
const evidence = `<section id="size-comparison"><h2>Original reference / size comparison ONLY</h2><p>Static 1800 ms samples. Both sizes use identical 8 × 16 terminal cells (square 8 × 8 half-pixels), matching Warp cell aspect. The interactive hero above is the production candidate, not this original.</p>${comparisons(8)}<details><summary>2× enlarged original / candidate comparison</summary>${comparisons(16)}</details><h2>Actual OpenCode 1.18.30 framebuffer captures</h2><p>Native 8 × 16 cells; no shrink-to-fit. Colors and half-blocks are captured from the real host. Text is browser-rasterized, not an OS screenshot of Warp.</p>${await capture('tools', 'Production sidebar · working · one blank row before project path')}${await capture('moving-perch', 'Production input · thinking · top-right nesting')}</section>`
const demo = await buildScreen()
const html = demo.replace('</style>', '#size-comparison{width:calc(100vw - 48px);position:relative;left:50%;transform:translateX(-50%)} </style>').replace('</main>', `${evidence}</main>`)
await Bun.write(`${directory}/three-quarter-demo.html`, demo)
await Bun.write(`${directory}/three-quarter-visual.html`, html)
if (process.argv.includes('--publish')) {
  const metadata = Bun.file(`${directory}/three-quarter-preview.json`)
  const fallback = Bun.file(`${directory}/hat-spacing-preview.json`)
  const previous = await metadata.exists() ? await metadata.json() : await fallback.json()
  const info = await ensureServer(previous, await findCompanion(), process.cwd(), true)
  const screen = await publishScreen(info, html)
  await Bun.write(`${directory}/three-quarter-preview.json`, JSON.stringify({ ...info, screen }, null, 2))
  console.log(info.url)
}
console.log(`${directory}/three-quarter-visual.html`)
