import { expect, test } from 'bun:test'
import { assertSidebarDirectory, assertSidebarFooter, sidebarFooterRows } from './fixtures/sidebar-footer'

const expected = ['/workspace/projects/opencode-', 'pals', '• OpenCode 1.18.30']
const capture = (footer: string[]) => [
  ...Array<string>(43).fill(''),
  'Jelly static: working', ...footer,
].map((sidebar, i) => {
  const main = i === 43 ? '/workspace/projects/opencode-pals' : ''
  return main.padEnd(118) + sidebar.padEnd(42)
}).join('\n') + '\n'

test('preserves ordered sidebar footer rows beneath the static pet label', () => {
  const baseline = capture(expected).replace('Jelly static: working', ' '.repeat(21))
  expect(sidebarFooterRows(baseline, 160)).toEqual(expected)
  expect(() => assertSidebarFooter(capture(expected), 160, expected)).not.toThrow()
})

test('rejects a missing sidebar path even when the main status path remains', () => {
  const missing = capture(['• OpenCode 1.18.30'])
  expect(missing).toContain('/workspace/projects/opencode-pals')
  expect(() => assertSidebarFooter(missing, 160, expected)).toThrow()
})

test('rejects reordered sidebar path and version lines', () => {
  expect(() => assertSidebarFooter(capture([expected[2]!, expected[0]!, expected[1]!]), 160, expected)).toThrow()
})

test('historical native footer accepts renamed checkouts and rejects the old directory', () => {
  for (const name of ['opencode-pals', 'custom checkout']) {
    const directory = `/workspace/projects/${name}`
    const rows = sidebarFooterRows(capture(['/workspace/projects/', name, '• OpenCode 1.18.30']), 160)
    expect(() => assertSidebarDirectory(rows, directory)).not.toThrow()
    expect(() => assertSidebarDirectory(['/workspace/opencode-plugins', '• OpenCode 1.18.30'], directory)).toThrow()
  }
})
