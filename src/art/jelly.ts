import { createFrame, put } from './raster'
import type { Character, Skin } from './types'

const skyBlue: Skin = {
  id: 'sky-blue', name: 'Sky blue',
  palette: {
    outline: '#24618e', shadow: '#338bc4', lowerBody: '#419bd1',
    body: '#64b9ed', highlight: '#89d0f5', ink: '#193f62',
  },
}

// Inclusive silhouette spans from v9, beginning at y=12.
const rows = [[8, 15], [6, 17], [5, 18], [5, 18], [4, 19], [5, 18],
  [4, 19], [3, 19], [3, 20], [4, 20], [4, 19], [5, 18]] as const

export const jelly: Character = {
  id: 'jelly', name: 'Jelly', skins: [skyBlue], hats: ['none', 'lavender-bucket'],
  defaults: { skin: 'sky-blue', hat: 'lavender-bucket' },
  // Crown top; hats draw in local coordinates and apply the shared dy once.
  anchor: { x: 8, y: 7 },
  // Union of visible art across bare/hatted poses, including the three-row hop.
  bounds: { x: 3, y: 4, width: 18, height: 20 },
  draw(pose, skin) {
    const frame = createFrame()
    const p = skin.palette
    const dot = (x: number, y: number, w: number, h: number, color: string) => put(frame, x, y + pose.dy, w, h, color)
    rows.forEach(([left, right], i) => {
      for (let x: number = left; x <= right; x++) {
        const edge = x === left || x === right || i === 0 || i === 11
        dot(x, 12 + i, 1, 1, edge ? p.outline : x < left + 3 ? p.shadow : i > 8 ? p.lowerBody : p.body)
      }
    })
    dot(7, 14, 3, 1, p.highlight)
    dot(5, 20, 2, 2, p.shadow)
    dot(17, 21, 2, 1, p.shadow)

    const ey = 17
    for (const x of [7 + pose.eyeDx, 15 + pose.eyeDx]) {
      if (pose.mood === 'done') {
        dot(x, ey, 2, 1, p.ink)
        dot(x - 1, ey + 1, 1, 1, p.ink)
      } else if (pose.blink) {
        dot(x, ey + 1, 2, 1, p.ink)
      } else {
        dot(x, ey, 2, pose.mood === 'waiting' ? 3 : 2, p.ink)
        if (pose.mood === 'working') dot(x + (x < 12 ? -1 : 0), ey - 1, 3, 1, p.ink)
      }
    }
    if (pose.mood === 'error') {
      dot(11, ey + 3, 2, 1, p.ink)
      dot(10, ey + 4, 1, 1, p.ink)
    } else if (pose.mood === 'waiting') {
      dot(11, ey + 3, 2, 2, p.ink)
    } else {
      dot(11, ey + 4, 2, 1, p.ink)
    }
    return frame
  },
}
