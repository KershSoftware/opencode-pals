import type { Character } from '../../src/art/types'
import { createFrame, put } from '../../src/art/raster'

/** Hand-measurable one-off, deliberately absent from the production catalog. */
export default {
  id: 'trial-sprout', name: 'Trial sprout',
  skins: [{ id: 'green', name: 'Green', palette: { body: '#00aa44', face: '#ffcc00' } }],
  hats: ['none'], defaults: { skin: 'green', hat: 'none' },
  anchor: { x: 12, y: 12 }, bounds: { x: 10, y: 10, width: 4, height: 10 },
  draw(pose, skin) {
    const frame = createFrame()
    put(frame, 10, 13 + pose.dy, 4, 7, skin.palette.body!)
    if (pose.mood === 'error') put(frame, 11, 15 + pose.dy, 2, 1, skin.palette.face!)
    return frame
  },
} satisfies Character
