import type { Catalog, Pose } from '../src/art/types'

/** Trial-only layer wrappers; the production composer supplies the frame key. */
export function forceTrialPose(catalog: Catalog, sample: () => Pose): Catalog {
  const poses = new WeakMap<Pose, Pose>()
  const forced = (pose: Pose) => {
    let value = poses.get(pose)
    if (!value) { value = sample(); poses.set(pose, value) }
    return value
  }
  return {
    characters: catalog.characters.map(c => ({ ...c, draw: (pose, skin) => c.draw(forced(pose), skin) })),
    hats: catalog.hats.map(h => ({ ...h, draw: (pose, anchor) => h.draw(forced(pose), anchor) })),
  }
}
