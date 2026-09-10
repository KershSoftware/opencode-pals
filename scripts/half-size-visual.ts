// Render actual installed-host span captures at ordinary 8 × 16 cell scale.
// Half-blocks are painted as their two native colors, without font resampling.
throw new Error('Historical rejected half-size generator: not reproducible with current sources. Use scripts/three-quarter-visual.ts after native activity capture.')
import { catalog, referenceCatalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { buildScreen, inlineScript } from './demo'

const directory = '.superpowers/sdd/2026-09-10-blue-jelly'
const captures = await Promise.all([
  ['Before · working sidebar', '.superpowers/native-smoke/placement-working/sidebar.json'],
  ['After · working sidebar', '.superpowers/native-smoke/activity/tools.json'],
  ['After · home input', '.superpowers/native-smoke/activity/home.json'],
  ['After · thinking input', '.superpowers/native-smoke/activity/moving-perch.json'],
  ['After · waiting panel', '.superpowers/native-smoke/activity/permission.json'],
].map(async ([title, path]) => ({ title, ...await Bun.file(path).json() })))
const art = ['none', 'lavender-bucket'].flatMap(hat => ['thinking', 'working'].flatMap(mood =>
  [referenceCatalog, catalog].map((source, i) => ({ title: `${i ? 'Half' : 'Original'} · ${hat} · ${mood}`,
    frame: compose(source, { character: 'jelly', skin: 'sky-blue', hat }, mood as 'thinking' | 'working', 0, false) }))))
const code = `
const captures=${JSON.stringify(captures)}, art=${JSON.stringify(art)};
const hex=c=>'#'+[0,1,2].map(i=>c.buffer[i].toString(16).padStart(2,'0')).join('');
function card(title, width, height, parent) {
  const box=document.createElement('section'), label=document.createElement('h3'), canvas=document.createElement('canvas');
  label.textContent=title; canvas.width=width; canvas.height=height;
  box.append(label,canvas); parent.append(box); return canvas.getContext('2d');
}
for(const item of art) {
  const ctx=card(item.title,192,192,document.querySelector('#art'));
  ctx.fillStyle='#141618';ctx.fillRect(0,0,192,192);
  item.frame.pixels.forEach((p,i)=>{if(p){ctx.fillStyle=p;ctx.fillRect(i%24*8,Math.floor(i/24)*8,8,8)}});
}
for(const capture of captures) {
  const ctx=card(capture.title,capture.width*8,capture.height*16,document.querySelector('#captures'));
  ctx.font='13px Menlo, monospace';ctx.textBaseline='top';
  capture.lines.forEach((line,y)=>{let x=0;for(const span of line.spans) for(const char of span.text) {
    ctx.fillStyle=hex(span.bg);ctx.fillRect(x*8,y*16,8,16);
    ctx.fillStyle=hex(span.fg);
    if(char==='▀') ctx.fillRect(x*8,y*16,8,8);
    else if(char==='█') ctx.fillRect(x*8,y*16,8,16);
    else if(char==='▄') ctx.fillRect(x*8,y*16+8,8,8);
    else ctx.fillText(char,x*8,y*16,8);
    x++;
  }});
}
`
await Bun.write(`${directory}/half-size-visual.html`, `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Jelly half-size evidence</title><style>
body{background:#10151b;color:#d6dde4;font:14px system-ui;margin:24px}h1{font-size:24px}h3{font-size:13px}#art{display:grid;grid-template-columns:repeat(4,220px);gap:12px}canvas{display:block}#captures section{margin:30px 0}a{color:#9edcff}
</style><h1>Half-size jelly · ordinary terminal cell scale</h1><p>8 × 16 cells, no CSS scaling. Original: 18 columns / ~9 rows. Compact: 9 columns / 4–5 rows; reserved perch 13 → 7 rows.</p><p>Art comparison uses shared source; terminal screens below are actual installed OpenCode 1.18.30 framebuffer captures (text rasterized for browser viewing).</p><a href="half-size-demo.html">Interactive shared-art demo</a><div id="art"></div><div id="captures"></div><script>${inlineScript(code)}</script></html>`)
await Bun.write(`${directory}/half-size-demo.html`, await buildScreen())
console.log(`${directory}/half-size-visual.html`)
