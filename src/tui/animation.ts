import { catalog } from '../art/catalog'
import { compose } from '../art/compose'
import type { Appearance, Frame } from '../art/types'
import { createMoodController, type Activity } from '../state/mood'
import { createFrameClock } from './frame-clock'

/** One instance per plugin, independent of whichever anchor currently owns it. */
export function createPetAnimator(publish: (frame: Frame) => void) {
  const controller = createMoodController()
  let appearance: Appearance = { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' }
  let animate = true
  let enabled = true
  let disposed = false
  let previous: Frame | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const clock = createFrameClock(render)
  function cancelDeadline() { if (deadline !== undefined) clearTimeout(deadline); deadline = undefined }
  function render(now: number) {
    if (disposed || !enabled) return
    cancelDeadline()
    const snapshot = controller.current(now)
    const frame = compose(catalog, appearance, snapshot.mood, now - snapshot.since, animate)
    if (!previous || frame.width !== previous.width || frame.height !== previous.height || frame.pixels.some((pixel, i) => pixel !== previous!.pixels[i])) {
      previous = frame; publish(frame)
    }
    const at = controller.nextDeadline()
    if (!animate && at !== null) deadline = setTimeout(() => render(performance.now()), Math.max(0, at - now))
  }
  return {
    configure(next: Appearance, motion: boolean, visible: boolean) {
      if (disposed) return
      appearance = next; animate = motion; enabled = visible
      cancelDeadline()
      if (!enabled) controller.reset()
      clock.setActive(enabled && animate)
      render(performance.now())
    },
    update(activity: Activity) {
      if (disposed || !enabled) return
      cancelDeadline()
      if (!activity.observedLive) controller.reset()
      const now = performance.now()
      controller.update(activity, now)
      render(now)
    },
    dispose() { if (disposed) return; disposed = true; cancelDeadline(); clock.dispose(); controller.reset() },
  }
}
