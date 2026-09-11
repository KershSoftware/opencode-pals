import { jelly } from './jelly'
import { lavenderBucket } from './hats'
import { createFrame, put } from './raster'
import type { Character, Hat, Pose } from './types'

// Hand-authored three-quarter layers retain the stepped body and fabric detail.
// A terminal half-cell is the smallest motion step; the hop is one pixel.
const shift = (pose: Pose) => Math.sign(pose.dy)
export const compactJelly: Character = {
  ...jelly,
  anchor: { x: 5, y: 3 },
  bounds: { x: 2, y: 2, width: 14, height: 14 },
  draw(pose, skin) {
    const frame = createFrame()
    const p = skin.palette
    const dot = (x: number, y: number, w: number, h: number, color: string) =>
      put(frame, x, y + shift(pose), w, h, color)
    const rows = [[6, 11], [4, 13], [3, 14], [3, 14], [2, 14], [2, 15], [3, 15], [3, 14], [4, 13]]
    rows.forEach(([left, right], i) => {
      for (let x = left; x <= right; x++) {
        dot(x, 7 + i, 1, 1, x === left || x === right || i === 0 || i === 8 ? p.outline
          : x < left + 2 ? p.shadow : i > 5 ? p.lowerBody : p.body)
      }
    })
    dot(5, 8, 3, 1, p.highlight)
    dot(4, 13, 1, 1, p.shadow)
    dot(12, 14, 2, 1, p.shadow)
    // The working brow starts BELOW a complete unbroken brim/face gap.
    for (const x of [5 + pose.eyeDx, 11 + pose.eyeDx]) {
      if (pose.blink) dot(x, 11, 2, 1, p.ink)
      else if (pose.mood === 'done') {
        dot(x, 10, 2, 1, p.ink); dot(x - 1, 11, 1, 1, p.ink)
      } else {
        dot(x, 10, 2, 2, p.ink)
        if (pose.mood === 'working') dot(x - (x < 9 ? 1 : 0), 9, 3, 1, p.ink)
      }
    }
    dot(8, 13, 2, 1, p.ink)
    if (pose.mood === 'waiting') dot(8, 12, 2, 1, p.ink)
    if (pose.mood === 'error') dot(7, 14, 1, 1, p.ink)
    return frame
  },
}

export const compactBucket: Hat = {
  ...lavenderBucket,
  draw(pose, anchor) {
    const frame = createFrame()
    const dot = (x: number, y: number, w: number, color: string) =>
      put(frame, anchor.x + x, anchor.y + y + shift(pose), w, 1, color)
    // Rounded shoulder, upright fabric sides and an uneven, downturned hem.
    // A longer right fold breaks the geometric taper without lowering the gap.
    dot(0, 0, 7, '#8776a8'); dot(1, 0, 4, '#a591ca')
    dot(-1, 1, 9, '#8776a8'); dot(0, 1, 7, '#bdaae0')
    dot(1, 1, 2, '#cbbbe9'); dot(6, 1, 1, '#aa97cf')
    dot(-1, 2, 9, '#8776a8'); dot(0, 2, 7, '#bdaae0')
    dot(6, 2, 1, '#a591ca'); dot(3, 2, 2, '#fff0cb')
    dot(-2, 3, 12, '#8776a8'); dot(-1, 3, 10, '#aa97cf')
    dot(0, 3, 2, '#bdaae0'); dot(1, 3, 5, '#8776a8')
    dot(-3, 4, 4, '#8776a8'); dot(5, 4, 6, '#8776a8')
    dot(-2, 4, 2, '#aa97cf'); dot(6, 4, 3, '#a591ca')
    return frame
  },
}
