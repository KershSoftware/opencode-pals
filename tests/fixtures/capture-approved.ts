// Independent oracle: execute the existing v9 draw function, never src/art.
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'

const script = await Bun.file(new URL('./approved-v9.js', import.meta.url)).text()
if (!script?.includes('function draw(canvas,t)')) throw new Error('v9 draw function missing')

// The shim supports precisely the opaque, integer fillRect/clearRect operations
// used by v9. Fail rather than silently approximate any new canvas operation.
const records = runInNewContext(`${script}
since = 0;
const records = [];
for (const selectedHat of [false, true]) {
  hat = selectedHat;
  for (const [selectedMood, times] of Object.entries({
    idle: [0, 140, 4899, 4900],
    thinking: [500, 1800, 3200, 3700],
    working: [0, 1256], waiting: [0],
    done: [0, 450, 900, 1400, 1401],
    error: [0, 250], interrupted: [0, 650, 651]
  })) {
    mood = selectedMood;
    for (const ms of times) {
      const pixels = Array(24 * 24).fill(null);
      const ctx = {
        fillStyle: '',
        clearRect(x, y, w, h) {
          if (x !== 0 || y !== 0 || w !== 24 || h !== 24) throw Error('unexpected clear');
          pixels.fill(null);
        },
        fillRect(x, y, w, h) {
          if (![x,y,w,h].every(Number.isInteger) || !/^#[0-9a-f]{6}$/.test(this.fillStyle))
            throw Error('unsupported canvas operation');
          for (let yy = Math.max(0,y); yy < Math.min(24,y+h); yy++)
            for (let xx = Math.max(0,x); xx < Math.min(24,x+w); xx++)
              pixels[yy*24+xx] = this.fillStyle;
        }
      };
      draw({ getContext: () => ctx }, ms);
      records.push({ appearance: { character: 'jelly', skin: 'sky-blue',
        hat: hat ? 'lavender-bucket' : 'none' }, mood, ms,
        frame: { width: 24, height: 24, pixels } });
    }
  }
}
records;`, {
  performance: { now: () => 0 },
  matchMedia: () => ({ matches: false }),
}) as unknown[]

const json = JSON.stringify(records, null, 2) + '\n'
if (process.argv.includes('--write')) {
  await Bun.write(new URL('./approved-jelly.json', import.meta.url), json)
} else {
  const existing = await Bun.file(new URL('./approved-jelly.json', import.meta.url)).text()
  if (existing !== json) throw new Error('Fixture differs from original v9 capture')
}
console.log(`${records.length} v9 frames ${process.argv.includes('--write') ? 'captured' : 'verified'}; source SHA-256 ${createHash('sha256').update(script).digest('hex')}`)
