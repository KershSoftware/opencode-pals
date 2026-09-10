import { createFrame, put } from './raster'
import type { Hat } from './types'

export const none: Hat = { id: 'none', name: 'None', draw: () => createFrame() }

export const lavenderBucket: Hat = {
  id: 'lavender-bucket', name: 'Lavender bucket',
  draw(pose, anchor) {
    const frame = createFrame()
    const edge = '#655887', purple = '#b5a1df', light = '#d6c8f2', shade = '#9180bf'
    const dot = (x: number, y: number, w: number, h: number, color: string) =>
      put(frame, anchor.x + x, anchor.y + y + pose.dy, w, h, color)
    dot(0, 0, 8, 1, edge)
    dot(-1, 1, 10, 3, edge)
    dot(0, 1, 8, 1, light)
    dot(0, 2, 8, 2, purple)
    dot(7, 2, 1, 2, shade)
    dot(-2, 4, 12, 1, edge)
    dot(-1, 4, 10, 1, shade)
    dot(-3, 5, 14, 1, edge)
    dot(-2, 5, 12, 1, purple)
    dot(-4, 6, 16, 1, edge)
    dot(-3, 6, 14, 1, purple)
    dot(-4, 7, 16, 1, edge)
    dot(2, 3, 2, 1, '#fff0cb')
    return frame
  },
}
