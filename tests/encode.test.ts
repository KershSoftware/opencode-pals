import { expect, test } from 'bun:test'
import { encodeFrame } from '../src/tui/encode'

test('encodes transparent halves against their own background', () => {
  const cells = encodeFrame({ width: 2, height: 2,
    pixels: ['#64b9ed', null, null, '#655887'] }, () => '#141618')
  expect(cells).toEqual([[
    { char: '▀', fg: '#64b9ed', bg: '#141618' },
    { char: '▀', fg: '#141618', bg: '#655887' },
  ]])
})

test('samples each transparent pixel separately and pads an odd final row', () => {
  const calls: number[][] = []
  const cells = encodeFrame({ width: 2, height: 3,
    pixels: [null, '#111111', null, null, '#222222', null] }, (x, y) => {
    calls.push([x, y])
    return `#0000${x}${y}`
  })
  expect(cells).toEqual([
    [{ char: '▀', fg: '#000000', bg: '#000001' }, { char: '▀', fg: '#111111', bg: '#000011' }],
    [{ char: '▀', fg: '#222222', bg: '#000003' }, { char: '▀', fg: '#000012', bg: '#000013' }],
  ])
  expect(calls).toEqual([[0, 0], [0, 1], [1, 1], [0, 3], [1, 2], [1, 3]])
})

test('an empty frame has no terminal rows', () => {
  expect(encodeFrame({ width: 0, height: 0, pixels: [] }, () => '#000000')).toEqual([])
})
