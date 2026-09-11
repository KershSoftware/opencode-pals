import { expect, test } from 'bun:test'
import { forceTrialPose } from '../scripts/trial-pose'
import { compose } from '../src/art/compose'
import { poseAt } from '../src/art/timeline'
import { createFrame } from '../src/art/raster'
import type { Mood, Pose } from '../src/art/types'
import character from './fixtures/trial-character'

test('a slow body crossing a timeline boundary shares one sampled pose with its hat; later frames resample', () => {
  let now = 249.9; let samples = 0; let mood: Mood = 'error'; let animate = true
  const poses: Pose[] = []
  const catalog = forceTrialPose({
    characters: [{ ...character, hats: ['cap'], draw(pose, skin) {
      poses.push(pose); now = 250.1
      return character.draw(pose, skin)
    } }],
    hats: [{ id: 'cap', name: 'Cap', draw(pose) { poses.push(pose); return createFrame() } }],
  }, () => { samples++; return { ...poseAt(mood, now, animate), mood } })
  const draw = () => compose(catalog, { character: character.id, skin: 'green', hat: 'cap' }, 'idle', 0, true)
  draw()
  expect(poses[0]!.dy).toBe(-1)
  expect(poses[1]).toBe(poses[0]!)
  expect(samples).toBe(1)
  draw()
  expect(poses[2]!.dy).toBe(0)
  expect(poses[3]).toBe(poses[2]!)
  expect(samples).toBe(2)
  mood = 'thinking'; animate = false
  draw()
  expect(poses[4]).toEqual({ mood: 'thinking', dy: 0, eyeDx: 1, blink: false })
  expect(poses[5]).toBe(poses[4]!)
  mood = 'done'; now = 2000; animate = true
  draw()
  expect(poses[6]!.mood).toBe('done')
  expect(poses[7]).toBe(poses[6]!)
  expect(samples).toBe(4)
})
