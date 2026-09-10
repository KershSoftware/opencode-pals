import type { Frame } from '../art/types'

export type Cell = { char: '▀'; fg: string; bg: string }

export function encodeFrame(frame: Frame, background: (x: number, y: number) => string, pixelOffsetY: 0 | 1 = 0): Cell[][] {
  const rows: Cell[][] = []
  const pixel = (x: number, y: number) => y >= pixelOffsetY && y < frame.height + pixelOffsetY
    ? frame.pixels[(y - pixelOffsetY) * frame.width + x] : null
  for (let y = 0; y < frame.height + pixelOffsetY; y += 2) {
    const row: Cell[] = []
    for (let x = 0; x < frame.width; x++) {
      row.push({
        char: '▀',
        fg: pixel(x, y) ?? background(x, y),
        bg: pixel(x, y + 1) ?? background(x, y + 1),
      })
    }
    rows.push(row)
  }
  return rows
}
