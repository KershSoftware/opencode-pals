import type { Mood, Pose } from './types'

/** Pure timeline; scheduling and the shared <=10 Hz clock belong to the host. */
export function poseAt(mood: Mood, elapsedMs: number, animate: boolean): Pose {
  if (!animate) return { mood, dy: 0, eyeDx: mood === 'thinking' ? 1 : 0, blink: false }

  const age = Math.max(0, elapsedMs)
  const state = (mood === 'done' && age > 1400) || (mood === 'interrupted' && age > 650) ? 'idle' : mood
  const dy = state === 'done' ? -Math.round(Math.sin(Math.min(age / 900, 1) * Math.PI) * 3)
    : state === 'error' && age < 250 ? -1
    : state === 'working' ? -Math.round((1 - Math.cos(age / 400)) / 2) : 0
  const phase = age % 4800
  return {
    mood: state,
    dy: dy || 0,
    eyeDx: state === 'thinking' && phase >= 1100 && phase < 3000 ? 1 : 0,
    blink: (state === 'idle' && age % 4900 < 140) || (state === 'thinking' && phase >= 3650 && phase < 3790),
  }
}
