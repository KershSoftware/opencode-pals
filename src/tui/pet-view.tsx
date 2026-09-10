import { createMemo, For } from 'solid-js'
import type { Frame } from '../art/types'
import { encodeFrame } from './encode'
export { createFrameClock, type FrameClock } from './frame-clock'

export function PetView(props: { frame: Frame; background: (x: number, y: number) => string; pixelOffsetY?: 0 | 1; columns?: { x: number; width: number } }) {
  const width = () => props.columns?.width ?? props.frame.width
  const rows = createMemo(() => encodeFrame(props.frame, props.background, props.pixelOffsetY)
    .map(row => props.columns ? row.slice(props.columns.x, props.columns.x + props.columns.width) : row))
  return (
    <box width={width()} height={Math.ceil((props.frame.height + (props.pixelOffsetY ?? 0)) / 2)} flexShrink={0} overflow="hidden">
      <For each={rows()}>{row => (
        <text width={width()} height={1} flexShrink={0} wrapMode="none">
          <For each={row}>{cell => <span style={{ fg: cell.fg, bg: cell.bg }}>{cell.char}</span>}</For>
        </text>
      )}</For>
    </box>
  )
}
