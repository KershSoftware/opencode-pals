import type { Frame, Pixel } from './types'

export function createFrame(width = 24, height = 24): Frame {
  return { width, height, pixels: Array<Pixel>(width * height).fill(null) }
}

/** Paint an integer rectangle, clipping at the frame edges. */
export function put(frame: Frame, x: number, y: number, width: number, height: number, color: Pixel): void {
  for (let yy = Math.max(0, y); yy < Math.min(frame.height, y + height); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(frame.width, x + width); xx++) {
      frame.pixels[yy * frame.width + xx] = color
    }
  }
}
