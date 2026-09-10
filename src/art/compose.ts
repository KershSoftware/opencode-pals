import { createFrame, put } from './raster'
import { poseAt } from './timeline'
import type { Appearance, Catalog, Frame, Mood } from './types'

export function compose(catalog: Catalog, appearance: Appearance, mood: Mood, elapsedMs: number, animate: boolean): Frame {
  const character = catalog.characters.find(c => c.id === appearance.character)
    ?? catalog.characters.find(c => c.id === 'jelly') ?? catalog.characters[0]
  if (!character) throw new Error('Cannot compose an empty character catalog')
  const skin = character.skins.find(s => s.id === appearance.skin)
    ?? character.skins.find(s => s.id === character.defaults.skin) ?? character.skins[0]
  if (!skin) throw new Error(`Character ${character.id} has no skins`)
  const compatible = (id: string) => id === 'none' || character.hats.includes(id)
  const hat = catalog.hats.find(h => h.id === appearance.hat && compatible(h.id))
    ?? catalog.hats.find(h => h.id === character.defaults.hat && compatible(h.id))
    ?? catalog.hats.find(h => h.id === 'none')
  const pose = poseAt(mood, elapsedMs, animate)
  const frame = createFrame()
  const overlay = (layer: Frame) => {
    layer.pixels.forEach((color, i) => {
      if (color !== null) put(frame, i % layer.width, Math.floor(i / layer.width), 1, 1, color)
    })
  }
  overlay(character.draw(pose, skin))
  if (hat) overlay(hat.draw(pose, character.anchor))
  return frame
}
