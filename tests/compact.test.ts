import { expect, test } from 'bun:test'
import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { perchFrame, perchGeometry, waitingFits } from '../src/tui/placement'
import type { Frame, Mood } from '../src/art/types'
import { poseAt } from '../src/art/timeline'

const appearance = { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }
const pixel = (f: Frame, x: number, y: number) => f.pixels[y * f.width + x]
const moods: Mood[] = ['idle', 'thinking', 'working', 'waiting', 'done', 'error', 'interrupted']

test('bucket retains a stepped short crown, cream accent and fourteen-column flared brim', () => {
  const frame = catalog.hats.find(h => h.id === 'lavender-bucket')!.draw(poseAt('idle', 500, true), { x: 5, y: 3 })
  const row = (y: number) => Array.from({ length: 14 }, (_, i) => pixel(frame, i + 2, y))
  expect(row(3).filter(Boolean).length).toBe(6)
  expect(row(4).filter(Boolean).length).toBe(8)
  expect(row(5)).toContain('#fff0cb')
  expect(row(6).every(p => ['#655887', '#9180bf', '#b5a1df', '#d6c8f2'].includes(p!))).toBe(true)
  expect(row(7)).toEqual(Array(14).fill('#655887'))
})

test('neutral and thinking eyes remain two-by-two squares through the glance, with hat optional', () => {
  for (const mood of ['idle', 'thinking'] as const) for (const hat of ['none', 'lavender-bucket']) {
    for (const ms of [500, 1100, 2900, 3200]) {
      const frame = compose(catalog, { ...appearance, hat }, mood, ms, true)
      const dx = mood === 'thinking' && ms >= 1100 && ms < 3000 ? 1 : 0
      for (const x of [5 + dx, 11 + dx]) {
        for (const yy of [10, 11]) for (const xx of [x, x + 1]) expect(pixel(frame, xx, yy)).toBe('#193f62')
        for (const [nx, ny] of [[x - 1, 10], [x + 2, 10], [x, 9], [x, 12]]) {
          expect(pixel(frame, nx, ny)).not.toBe('#193f62')
        }
      }
    }
  }
})

test('every mood retains a full blue separation row below the moving brim', () => {
  for (const mood of moods) for (const ms of [0, 140, 450, 1256, 1800, 3700]) {
    const dy = Math.sign(poseAt(mood, ms, true).dy)
    const frame = compose(catalog, appearance, mood, ms, true)
    for (let x = 2; x <= 15; x++) expect(pixel(frame, x, 7 + dy)).toBe('#655887')
    for (let x = 4; x <= 13; x++) {
      expect(['#338bc4', '#64b9ed', '#24618e', '#89d0f5']).toContain(pixel(frame, x, 8 + dy)!)
    }
  }
})

test('three-quarter art occupies fourteen columns and thirteen source rows without clipping any mood', () => {
  const geometry = perchGeometry(catalog.characters[0]!.bounds)
  expect(geometry).toEqual({ x: 2, y: 0, width: 14, height: 16, rows: 9 })
  for (const mood of moods) for (const hat of ['none', 'lavender-bucket']) {
    for (const ms of [0, 140, 450, 900, 1256, 1800, 3700, 4900]) {
      const frame = compose(catalog, { ...appearance, hat }, mood, ms, true)
      const cropped = perchFrame(frame, geometry)
      expect(cropped.pixels.filter(Boolean).length).toBe(frame.pixels.filter(Boolean).length)
      const points = frame.pixels.flatMap((p, i) => p ? [{ x: i % frame.width, y: Math.floor(i / frame.width) }] : [])
      expect(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) + 1).toBe(14)
      expect(Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) + 1).toBe(hat === 'none' ? 9 : 13)
    }
  }
  expect(waitingFits({ width: 14, height: 10 }, 0, geometry)).toBe(true)
  expect(waitingFits({ width: 13, height: 30 }, 0, geometry)).toBe(false)
  expect(waitingFits({ width: 14, height: 9 }, 0, geometry)).toBe(false)
  expect(waitingFits({ width: 14, height: 1 }, 9, geometry)).toBe(true)
})

test('compact face keeps distinct eyes, tiny line mouth and a full body-colored working brim gap', () => {
  for (const hat of ['none', 'lavender-bucket']) {
    const frame = compose(catalog, { ...appearance, hat }, 'thinking', 500, true)
    expect(pixel(frame, 5, 10)).toBe('#193f62')
    expect(pixel(frame, 11, 10)).toBe('#193f62')
    expect(pixel(frame, 8, 13)).toBe('#193f62')
    expect(pixel(frame, 9, 13)).toBe('#193f62')
    expect(pixel(frame, 8, 12)).not.toBe('#193f62')
    expect(pixel(frame, 7, 13)).not.toBe('#193f62')
    expect(pixel(frame, 10, 13)).not.toBe('#193f62')
  }
  for (const [ms, dy] of [[0, 0], [1256, -1]]) {
    const frame = compose(catalog, appearance, 'working', ms, true)
    for (let x = 4; x <= 13; x++) {
      expect(pixel(frame, x, 7 + dy)).toBe('#655887')
      expect(['#338bc4', '#64b9ed', '#24618e', '#89d0f5']).toContain(pixel(frame, x, 8 + dy)!)
    }
    expect(pixel(frame, 5, 10 + dy)).toBe('#193f62')
    expect(pixel(frame, 11, 10 + dy)).toBe('#193f62')
  }
})
