import { expect, test } from 'bun:test'
import { compose } from '../src/art/compose'
import { referenceCatalog as catalog } from '../src/art/catalog'
import { poseAt } from '../src/art/timeline'
import { createFrame, put } from '../src/art/raster'
import type { Appearance, Mood, Frame } from '../src/art/types'
import approved from './fixtures/approved-jelly.json'

// JSON imports widen string literals; keep the public contracts unchanged.
const fixtures = approved as { appearance: Appearance; mood: Mood; ms: number; frame: Frame }[]
const appearance: Appearance = { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }
const moods: Mood[] = ['idle', 'thinking', 'working', 'waiting', 'done', 'error', 'interrupted']
const pixel = (frame: Frame, x: number, y: number) => frame.pixels[y * frame.width + x]

test('matches approved v9 pixels, with coordinate diagnostics', () => {
  // Independent coverage contract: neither deleting nor duplicating fixture
  // records may silently reduce the approved animation/appearance coverage.
  const times: Record<Mood, number[]> = {
    idle: [0, 140, 4899, 4900],
    thinking: [500, 1800, 3200, 3700],
    working: [0, 1256],
    waiting: [0],
    done: [0, 450, 900, 1400, 1401],
    error: [0, 250],
    interrupted: [0, 650, 651],
  }
  const expectedCases = ['none', 'lavender-bucket'].flatMap(hat =>
    moods.flatMap(mood => times[mood].map(ms => `jelly/sky-blue/${hat}/${mood}/${ms}`)))
  const actualCases = fixtures.map(({ appearance, mood, ms }) =>
    `${appearance.character}/${appearance.skin}/${appearance.hat}/${mood}/${ms}`)
  expect(fixtures).toHaveLength(42)
  expect(new Set(actualCases).size).toBe(42)
  expect(actualCases.sort()).toEqual(expectedCases.sort())
  for (const item of fixtures) {
    expect([item.frame.width, item.frame.height, item.frame.pixels.length],
      `fixture ${item.appearance.hat}/${item.mood}/${item.ms}`).toEqual([24, 24, 576])
    const frame = compose(catalog, item.appearance, item.mood, item.ms, true)
    expect([frame.width, frame.height, frame.pixels.length]).toEqual([24, 24, 576])
    item.frame.pixels.forEach((color, i) => {
      expect(frame.pixels[i], `${item.appearance.hat}/${item.mood}/${item.ms} (${i % 24},${Math.floor(i / 24)})`).toBe(color)
    })
    expect(frame).toEqual(item.frame)
  }
})

test('working brim remains separated from eyebrows throughout bob', () => {
  for (const [ms, dy] of [[0, 0], [1256, -1]]) {
    const frame = compose(catalog, appearance, 'working', ms, true)
    for (let x = 4; x < 20; x++) expect(pixel(frame, x, 14 + dy)).toBe('#655887')
    for (const x of [6, 7, 8, 15, 16, 17]) {
      const color = pixel(frame, x, 15 + dy)
      expect(color).not.toBeNull()
      if (color !== null) expect(['#64b9ed', '#338bc4']).toContain(color)
    }
    expect(pixel(frame, 7, 16 + dy)).toBe('#193f62')
  }
})

test('bare head is complete and the independent hat only replaces its layer', () => {
  const bare = compose(catalog, { ...appearance, hat: 'none' }, 'working', 0, true)
  const hatted = compose(catalog, appearance, 'working', 0, true)
  for (let x = 8; x <= 15; x++) expect(pixel(bare, x, 12)).toBe('#24618e')
  expect(pixel(bare, 7, 14)).toBe('#89d0f5')
  const layer = catalog.hats.find(h => h.id === 'lavender-bucket')!
    .draw(poseAt('working', 0, true), catalog.characters[0].anchor)
  for (let i = 0; i < 576; i++) expect(hatted.pixels[i]).toBe(layer.pixels[i] ?? bare.pixels[i])
})

test('thinking silhouette stays stationary and retains its tiny line mouth', () => {
  for (const hat of ['none', 'lavender-bucket']) {
    const frames = [500, 1800, 3200, 3700].map(ms => compose(catalog, { ...appearance, hat }, 'thinking', ms, true))
    for (const frame of frames) {
      expect(frame.pixels.map(p => p !== null)).toEqual(frames[0].pixels.map(p => p !== null))
      for (let y = 0; y < 17; y++) for (let x = 0; x < 24; x++)
        expect(pixel(frame, x, y)).toBe(pixel(frames[0], x, y))
      expect(pixel(frame, 11, 21)).toBe('#193f62')
      expect(pixel(frame, 11, 20)).not.toBe('#193f62')
    }
  }
})

test('whole-body motion translates every body, face, and hat pixel together', () => {
  for (const hat of ['none', 'lavender-bucket']) {
    for (const [mood, first, second, shift] of [
      ['working', 0, 1256, -1], ['done', 0, 450, -3], ['error', 250, 0, -1],
    ] as const) {
      const base = compose(catalog, { ...appearance, hat }, mood, first, true)
      const moved = compose(catalog, { ...appearance, hat }, mood, second, true)
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++)
        expect(pixel(moved, x, y)).toBe(y - shift < 24 ? pixel(base, x, y - shift) : null)
    }
  }
})

test('transparent margins and fixed alignment bounds contain all poses', () => {
  const { bounds } = catalog.characters[0]
  for (const item of fixtures) {
    const frame = compose(catalog, item.appearance, item.mood, item.ms, true)
    frame.pixels.forEach((color, i) => {
      if (color !== null) {
        expect(i % 24).toBeGreaterThanOrEqual(bounds.x)
        expect(i % 24).toBeLessThan(bounds.x + bounds.width)
        expect(Math.floor(i / 24)).toBeGreaterThanOrEqual(bounds.y)
        expect(Math.floor(i / 24)).toBeLessThan(bounds.y + bounds.height)
      }
    })
    for (let y = 0; y < 24; y++) for (const x of [0, 1, 2, 21, 22, 23]) expect(pixel(frame, x, y)).toBeNull()
  }
})

test('motion disabled holds static mood expressions without blinking or expiry', () => {
  for (const mood of moods) for (const hat of ['none', 'lavender-bucket']) {
    const first = compose(catalog, { ...appearance, hat }, mood, 0, false)
    for (const ms of [140, 450, 1800, 3700, 10000])
      expect(compose(catalog, { ...appearance, hat }, mood, ms, false)).toEqual(first)
    expect(poseAt(mood, 10000, false)).toEqual({ mood, dy: 0, eyeDx: mood === 'thinking' ? 1 : 0, blink: false })
  }
})

test('timeline respects glance, blink, and one-shot boundaries', () => {
  for (const [ms, eyeDx, blink] of [[1099, 0, false], [1100, 1, false], [2999, 1, false], [3000, 0, false], [3649, 0, false], [3650, 0, true], [3789, 0, true], [3790, 0, false], [4800, 0, false]] as const)
    expect(poseAt('thinking', ms, true)).toEqual({ mood: 'thinking', dy: 0, eyeDx, blink })
  expect(poseAt('done', 1400, true).mood).toBe('done')
  expect(poseAt('done', 1401, true).mood).toBe('idle')
  expect(poseAt('done', 5000, true).dy).toBe(0)
  expect(poseAt('interrupted', 650, true).mood).toBe('interrupted')
  expect(poseAt('interrupted', 651, true).mood).toBe('idle')
})

test('raster clips rectangles without wrapping rows or extending the frame', () => {
  const frame = createFrame(3, 2)
  put(frame, -1, -1, 2, 2, '#123456')
  put(frame, 2, 1, 4, 4, '#abcdef')
  put(frame, 9, 9, 1, 1, '#ffffff')
  expect(frame).toEqual({ width: 3, height: 2, pixels: ['#123456', null, null, null, null, '#abcdef'] })
})

test('catalog defaults recover unknown or incompatible appearance choices', () => {
  const expected = compose(catalog, appearance, 'idle', 500, true)
  expect(compose(catalog, { character: 'removed', skin: 'removed', hat: 'removed' }, 'idle', 500, true)).toEqual(expected)
  const restricted = { ...catalog, characters: [{ ...catalog.characters[0], hats: ['none'], defaults: { skin: 'sky-blue', hat: 'none' } }] }
  expect(compose(restricted, appearance, 'idle', 500, true)).toEqual(compose(catalog, { ...appearance, hat: 'none' }, 'idle', 500, true))
})

test('catalog selection uses skin palettes and passes the character anchor to hats', () => {
  const jelly = catalog.characters[0]
  const skin = { ...jelly.skins[0], id: 'test-skin', palette: Object.fromEntries(Object.keys(jelly.skins[0].palette).map(key => [key, '#abcdef'])) }
  const alternate = { ...jelly, id: 'test-character', skins: [skin], anchor: { x: jelly.anchor.x + 1, y: jelly.anchor.y - 1 } }
  const custom = { ...catalog, characters: [alternate] }
  const bare = compose(custom, { character: alternate.id, skin: skin.id, hat: 'none' }, 'waiting', 0, true)
  expect(new Set(bare.pixels)).toEqual(new Set([null, '#abcdef']))
  const hatted = compose(custom, { character: alternate.id, skin: skin.id, hat: 'lavender-bucket' }, 'waiting', 0, true)
  expect(pixel(hatted, 9, 6)).toBe('#655887')
  expect(pixel(hatted, 8, 6)).toBeNull()
})
