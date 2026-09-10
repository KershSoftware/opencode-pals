import assert from 'node:assert/strict'
import { buildScreen, inlineScript } from './demo'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const directory = '.superpowers/sdd/2026-09-10-blue-jelly'
const check = `
try {
 window.toggleSelect = () => {};
 const click = (id, label) => [...document.querySelectorAll('#'+id+' button')].find(b => b.textContent === label).click();
 const time = document.querySelector('#time');
 const seek = n => { time.value = n; time.dispatchEvent(new Event('input')); };
 const pixels = canvas => {
   const {width:w,height:h}=canvas, data=canvas.getContext('2d').getImageData(0,0,w,h).data;
   let left=w, top=h; const points=[];
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(data[i+3]){left=Math.min(left,x);top=Math.min(top,y);points.push([x,y,...data.slice(i,i+4)])}}
   return JSON.stringify(points.map(([x,y,...c])=>[x-left,y-top,...c]));
 };
 let checks=0;
 for(const hat of ['None','Lavender bucket']) {
   click('pickers',hat);
   for(const mood of ['Idle','Thinking','Working','Waiting','Finished','Error','Interrupted']) {
     click('moods',mood);
     for(const ms of [0,100,500,1300,2900,4900]) {
       seek(ms);
       const hero=pixels(document.querySelector('#hero'));
       for(const canvas of document.querySelectorAll('canvas')) {
         if(pixels(canvas)!==hero)throw new Error(hat+' '+mood+' '+ms+' differs: '+canvas.getAttribute('aria-label'));
         checks++;
       }
       if(document.querySelector('#pause').textContent!=='Resume')throw new Error('scrub must pause');
     }
   }
 }
 click('layouts','Sidebar open');
 if(document.querySelector('#sidebar').hidden)throw new Error('sidebar hidden');
 click('layouts','Waiting panel');
 if(document.querySelector('#waiting-panel').hidden)throw new Error('waiting hidden');
 const native=document.querySelector('#input-pet canvas'), hero=document.querySelector('#hero');
 if(parseFloat(native.style.width)/native.width!==8 || parseFloat(native.style.height)/native.height!==8)throw new Error('native cell aspect');
 if(parseFloat(getComputedStyle(hero).width)/hero.width!==16)throw new Error('hero must be exactly 2x native');
 document.body.innerHTML='<pre id="result">'+JSON.stringify({ok:true,checks,moods:7,hats:2,times:6,nativeCell:'8x16',heroScale:2})+'</pre>';
} catch(error) { document.body.innerHTML='<pre id="result">'+JSON.stringify({ok:false,error:String(error)})+'</pre>'; }
`
await Bun.write(`${directory}/three-quarter-preview-check.html`, (await buildScreen()).replace('</body>', `<script>${inlineScript(check)}</script></body>`))
const browser = process.env.PALS_CHROMIUM_EXECUTABLE || ['chromium', 'chromium-browser', 'google-chrome', 'chrome-headless-shell'].map(name => Bun.which(name)).find(Boolean)
if (!browser) throw new Error('Chromium not found on PATH. Install Chromium or set PALS_CHROMIUM_EXECUTABLE to its executable path.')
const child = Bun.spawn([browser, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--dump-dom', pathToFileURL(resolve(directory, 'three-quarter-preview-check.html')).href], { stdout: 'pipe', stderr: 'pipe' })
const [html, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
assert.equal(exit, 0, stderr)
const result = JSON.parse(html.match(/<pre id="result">(.*?)<\/pre>/)![1]!)
console.log(JSON.stringify(result, null, 2))
assert(result.ok, result.error)
await Bun.write(`${directory}/three-quarter-preview-check.json`, JSON.stringify(result, null, 2))
