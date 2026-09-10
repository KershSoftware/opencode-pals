import assert from 'node:assert/strict'
import { basename } from 'node:path'

// Pinned 1.18.30 sidebar: rightmost 42 columns, footer in the bottom 7 rows.
export function sidebarFooterRows(text: string, width: number): string[] {
  return text.split('\n').slice(-7)
    .map(line => line.slice(width - 42, width).trim()).filter(Boolean)
}

export function assertSidebarFooter(text: string, width: number, expected: string[]): void {
  const actual = sidebarFooterRows(text, width).slice(-expected.length)
  assert.deepEqual(actual, expected, 'sidebar footer path/version rows missing or out of order')
}

export function assertSidebarDirectory(footerLines: string[], directory: string): void {
  assert(footerLines.slice(0, -1).join('').includes(basename(directory)), 'did not find baseline sidebar path')
}
