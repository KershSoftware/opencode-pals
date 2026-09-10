import type { Character, Frame } from '../art/types'
export type Perch = 'none' | 'home' | 'prompt' | 'sidebar' | 'waiting'
export type PerchInput = {
  enabled: boolean; fits: boolean; dialogOpen: boolean
  route: 'home' | 'session' | 'other'
  sidebarVisible: boolean; promptVisible: boolean; waiting: boolean
}

export function choosePerch(input: PerchInput): Perch {
  if (!input.enabled || !input.fits || input.dialogOpen || input.route === 'other') return 'none'
  if (input.route === 'home') return 'home'
  if (input.sidebarVisible) return 'sidebar'
  if (input.promptVisible) return 'prompt'
  return input.waiting ? 'waiting' : 'none'
}

export const PERCH_ROWS = 9 // eight sprite cells plus one cell for nesting/sidebar padding
export function perchGeometry(bounds: Character['bounds']) {
  // Fixed animation union, not current-pose bounds. One blank cell above the
  // union (half the original spacing); pair the bottom pixel for nesting.
  const padding = 2 + bounds.height % 2
  const height = bounds.height + padding
  return { x: bounds.x, y: bounds.y - padding, width: bounds.width, height, rows: height / 2 + 1 }
}
export type PerchGeometry = ReturnType<typeof perchGeometry>
export function perchFrame(frame: Frame, geometry: PerchGeometry): Frame {
  const { x, y, width, height } = geometry
  return { width, height, pixels: Array.from({ length: width * height }, (_, i) => {
    const px = x + i % width; const py = y + Math.floor(i / width)
    return px >= 0 && px < frame.width && py >= 0 && py < frame.height ? frame.pixels[py * frame.width + px]! : null
  }) }
}
export function waitingFits(bounds: { width: number; height: number } | undefined, reserved: number,
  geometry: Pick<PerchGeometry, 'width' | 'rows'> = { width: 14, rows: PERCH_ROWS }): boolean {
  return !!bounds && bounds.width >= geometry.width && bounds.height + reserved >= geometry.rows + 1
}
