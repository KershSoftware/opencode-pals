import { expect, test } from 'bun:test'
import { choosePerch, waitingFits, perchGeometry, perchFrame, type PerchInput } from '../src/tui/placement'
import { encodeFrame } from '../src/tui/encode'
import { compose } from '../src/art/compose'
import { extendedCatalog } from './fixtures/catalog'
import { catalog } from '../src/art/catalog'

test('native crops use character animation unions, retaining Jelly coordinates and every hop pixel', () => {
  const jelly = catalog.characters[0]!
  expect(perchGeometry(jelly.bounds)).toEqual({ x: 2, y: 0, width: 14, height: 16, rows: 9 })
  const sprout = extendedCatalog.characters[1]!
  expect(perchGeometry(sprout.bounds)).toEqual({ x: 10, y: 10, width: 4, height: 10, rows: 6 })
  for (const character of [jelly, sprout, jelly]) for (const time of [0, 100, 300, 500, 700, 900]) {
    const frame = compose(extendedCatalog, { character: character.id, ...character.defaults }, 'done', time, true)
    const cropped = perchFrame(frame, perchGeometry(character.bounds))
    expect(cropped.pixels.filter(Boolean).length).toBe(frame.pixels.filter(Boolean).length)
    const columns = cropped.pixels.flatMap((pixel, i) => pixel ? [i % cropped.width] : [])
    expect(Math.min(...columns)).toBe(0)
    expect(Math.max(...columns)).toBe(cropped.width - 1)
  }
  // Asymmetric art spanning the edges of the valid shared canvas must not clip.
  const frame = { width: 24, height: 24, pixels: Array<string | null>(576).fill(null) }
  frame.pixels[0] = '#123456'; frame.pixels[23 * 24 + 22] = '#abcdef'
  const geometry = perchGeometry({ x: 0, y: 0, width: 23, height: 24 })
  expect(perchFrame(frame, geometry).pixels.filter(Boolean)).toEqual(['#123456', '#abcdef'])
  expect(waitingFits({ width: 23, height: 18 }, 0, geometry)).toBe(true)
  expect(waitingFits({ width: 22, height: 50 }, 0, geometry)).toBe(false)
})

const base: PerchInput = { enabled: true, fits: true, dialogOpen: false, route: 'session', sidebarVisible: false, promptVisible: true, waiting: false }
test('sidebar wins over prompt and waiting, including a manually opened narrow sidebar', () => {
  expect(choosePerch({ ...base, sidebarVisible: true, waiting: true })).toBe('sidebar')
})
test('uses waiting when the host replaces the prompt', () => {
  expect(choosePerch({ ...base, promptVisible: false, waiting: true })).toBe('waiting')
})
test('hidden prompt without an outstanding request has no perch', () => {
  expect(choosePerch({ ...base, promptVisible: false })).toBe('none')
})
test('visible prompt wins over waiting', () => expect(choosePerch({ ...base, waiting: true })).toBe('prompt'))
test('home wins over stale session anchors', () => expect(choosePerch({ ...base, route: 'home', sidebarVisible: true })).toBe('home'))
for (const override of [{ enabled: false }, { fits: false }, { dialogOpen: true }, { route: 'other' as const }]) {
  test(`global suppression precedes every perch: ${JSON.stringify(override)}`, () => {
    for (const route of ['home', 'session', 'other'] as const) {
      expect(choosePerch({ ...base, route, sidebarVisible: true, waiting: true, ...override })).toBe('none')
    }
  })
}
test('waiting reservation uses measured spare scroll height, remains stable after reservation, and fails closed', () => {
  expect(waitingFits({ width: 80, height: 10 }, 0)).toBe(true)
  expect(waitingFits({ width: 80, height: 1 }, 9)).toBe(true)
  expect(waitingFits({ width: 80, height: 9 }, 0)).toBe(false)
  expect(waitingFits({ width: 13, height: 50 }, 0)).toBe(false)
  expect(waitingFits(undefined, 0)).toBe(false)
})
test('one-pixel nesting retains the bottom art pixel above the blank panel half and samples each transparent half', () => {
  const cells = encodeFrame({ width: 1, height: 2, pixels: ['#123456', '#abcdef'] }, (_x, y) => y >= 2 ? '#111111' : '#000000', 1)
  expect(cells).toEqual([
    [{ char: '▀', fg: '#000000', bg: '#123456' }],
    [{ char: '▀', fg: '#abcdef', bg: '#111111' }],
  ])
})
