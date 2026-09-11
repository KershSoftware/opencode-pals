import { buildScreen } from './demo'
import { ensureServer, findCompanion, publishScreen } from './companion'

const directory = '.superpowers/sdd/2026-09-10-blue-jelly'
const revision = process.argv.includes('--v3') ? 'bucket-v3' : 'bucket-v2'
type Color = { buffer: Record<string, number> }
const hex = (c: Color) => '#' + [0, 1, 2].map(i => c.buffer[i]!.toString(16).padStart(2, '0')).join('')
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
async function capture(name: string, crop: boolean, scale = 1) {
  const c = await Bun.file(`.superpowers/native-smoke/activity/${name}.json`).json()
  const pet = c.tree.find((n: { id: string }) => n.id.startsWith('jelly-pet-'))
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
  const box = crop ? [pet.x * 8, pet.y * 16, 112, 160] : [0, 0, c.width * 8, c.height * 16]
  return `<svg role="img" aria-label="Native ${name} capture ${scale}x" viewBox="${box.join(' ')}" width="${box[2] * scale}" height="${box[3] * scale}" style="font:13px Menlo,monospace;flex-shrink:0" shape-rendering="crispEdges">${svg}</svg>`
}
const samples = [['baseline', 'Idle'], ['thinking', 'Thinking'], ['tools', 'Working'], ['permission', 'Waiting'], ['completion', 'Finished'], ['error', 'Error'], ['interrupt', 'Interrupted']]
const cards = await Promise.all(samples.map(async ([name, label]) => `<section><h3>${label}</h3><div style="display:flex;align-items:end;gap:16px"><div>Native 1×<br>${await capture(name!, true)}</div><div>Enlarged 2×<br>${await capture(name!, true, 2)}</div></div></section>`))
const evidence = `<section id="bucket-v2"><h2>Bucket v2 · actual native framebuffer evidence</h2><p>Fresh OpenCode 1.18.30 captures of the rebuilt source candidate. Native samples use 8 × 16 cells; enlarged samples are exactly 2×. Half-block colors come from the host; ordinary text is browser-rasterized. Visual approval pending.</p><div style="display:flex;flex-wrap:wrap;gap:24px">${cards.join('')}</div><h2>Native sidebar · working · blank row before project path</h2>${await capture('tools', false)}<h2>Native input · thinking</h2>${await capture('moving-perch', false)}</section>`
const html = (await buildScreen()).replace('</style>', '#bucket-v2{width:calc(100vw - 48px);position:relative;left:50%;transform:translateX(-50%);overflow:auto}</style>').replace('</main>', `${evidence.replace('Bucket v2 ·', `${revision === 'bucket-v3' ? 'Bucket v3' : 'Bucket v2'} ·`)}</main>`)
await Bun.write(`${directory}/${revision}-visual.html`, html)
if (process.argv.includes('--publish')) {
  const previous = await Bun.file(`${directory}/bucket-v2-preview.json`).json()
  const launcher = await findCompanion()
  const info = await ensureServer(previous, launcher, process.cwd())
  const screen = await publishScreen(info, html)
  await Bun.write(`${directory}/${revision}-preview.json`, JSON.stringify({ ...info, launcher, screen }, null, 2))
  console.log(info.url)
}
