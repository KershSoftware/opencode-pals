// Shared-source art plus actual native framebuffer evidence; no terminal images.
throw new Error('Historical intermediate hat-spacing generator: not reproducible with current sources. Use scripts/three-quarter-visual.ts after native activity capture.')
import { catalog, referenceCatalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { buildScreen, inlineScript } from './demo'
import { ensureServer, findCompanion, publishScreen } from './companion'
import type { Mood } from '../src/art/types'

const directory = '.superpowers/sdd/2026-09-10-blue-jelly'
const art = (['idle', 'thinking', 'working'] as Mood[]).flatMap(mood =>
  [referenceCatalog, catalog].map((source, i) => ({ title: `${i ? 'Revised compact' : 'Approved original'} · ${mood}`,
    frame: compose(source, { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }, mood, 1800, true) })))
const captures = await Promise.all([
  ['Revised native sidebar · one blank row before project path', 'tools'],
  ['Revised native input · retained top-right nesting', 'moving-perch'],
].map(async ([title, name]) => ({ title, ...await Bun.file(`.superpowers/native-smoke/activity/${name}.json`).json() })))
const code = `
const art=${JSON.stringify(art)}, captures=${JSON.stringify(captures)};
document.querySelector('details').open=new URLSearchParams(location.search).has('enlarged');
function card(title,w,h,parent){const s=document.createElement('section'),label=document.createElement('h3'),c=document.createElement('canvas');label.textContent=title;c.width=w;c.height=h;s.append(label,c);parent.append(s);return c.getContext('2d')}
for(const scale of [8,16]) for(const item of art){
 const ctx=card(item.title,24*scale,24*scale,document.querySelector(scale===8?'#native':'#enlarged'));
 ctx.fillStyle='#141414';ctx.fillRect(0,0,24*scale,24*scale);
 item.frame.pixels.forEach((p,i)=>{if(p){ctx.fillStyle=p;ctx.fillRect(i%24*scale,Math.floor(i/24)*scale,scale,scale)}});
}
const hex=c=>'#'+[0,1,2].map(i=>c.buffer[i].toString(16).padStart(2,'0')).join('');
for(const item of captures){
 const ctx=card(item.title,item.width*8,item.height*16,document.querySelector('#captures'));
 ctx.font='13px Menlo,monospace';ctx.textBaseline='top';
 item.lines.forEach((line,y)=>{let x=0;for(const span of line.spans)for(const char of span.text){
 ctx.fillStyle=hex(span.bg);ctx.fillRect(x*8,y*16,8,16);ctx.fillStyle=hex(span.fg);
 if(char==='▀')ctx.fillRect(x*8,y*16,8,8);else if(char==='▄')ctx.fillRect(x*8,y*16+8,8,8);else if(char==='█')ctx.fillRect(x*8,y*16,8,16);else ctx.fillText(char,x*8,y*16,8);x++;
 }});
}
document.querySelector('iframe').srcdoc=${JSON.stringify(await buildScreen())};
`
const html = `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Hat and sidebar correction</title><style>
body{background:#10151b;color:#d6dde4;font:14px system-ui;margin:24px}h1{font-size:26px}h3{font-size:13px}canvas{display:block;image-rendering:pixelated}#native{display:grid;grid-template-columns:repeat(6,192px);gap:16px}#enlarged{display:grid;grid-template-columns:repeat(2,384px);gap:16px}#captures section{margin:24px 0}iframe{width:1180px;height:1600px;border:1px solid #405262}summary{cursor:pointer;font-size:20px;margin:24px 0}
</style><h1>Revised compact bucket hat + sidebar spacing</h1><p>For final visual approval. Original reference is unchanged. Compact remains 9 columns × 4–5 visible rows.</p>
<h2>Native-scale comparison · same ordinary 8 × 16 text cells</h2><p>Each source pixel = 8 × 8 px. Original and revised are drawn at exactly the same scale; no shrink-to-fit.</p><div id="native"></div>
<details><summary>Enlarged inspection · 2× native scale (16 × 16 pixels)</summary><div id="enlarged"></div></details>
<h2>Actual OpenCode 1.18.30 captures · ordinary 8 × 16 cell scale</h2><p>Half-block colors come from the native framebuffer; ordinary text is browser-rasterized. These are not Warp OS screenshots. Confirmed user terminal: Warp 0.2026.08.26.</p><div id="captures"></div>
<h2>Interactive shared demo · optional hat, moods, animation and layout controls</h2><p>The demo’s top reference is original art; placement samples use revised compact art and the sidebar-only blank row.</p><iframe title="Shared interactive demo"></iframe><script>${inlineScript(code)}</script></html>`
await Bun.write(`${directory}/hat-spacing-visual.html`, html)
await Bun.write(`${directory}/hat-spacing-demo.html`, await buildScreen())
if (process.argv.includes('--publish')) {
  const metadata = Bun.file(`${directory}/hat-spacing-preview.json`)
  const previous = await metadata.exists() ? await metadata.json() : undefined
  const info = await ensureServer(previous, await findCompanion(), process.cwd(), true)
  const screen = await publishScreen(info, html)
  await Bun.write(`${directory}/hat-spacing-preview.json`, JSON.stringify({ ...info, screen }, null, 2))
  console.log(info.url)
}
console.log(`${directory}/hat-spacing-visual.html`)
