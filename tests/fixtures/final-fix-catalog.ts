import { extendedCatalog } from './catalog'
import type { Catalog, Character } from '../../src/art/types'
import { createFrame, put } from '../../src/art/raster'

const edge: Character = {
  id: 'edge', name: 'Asymmetric edge fixture',
  skins: [{ id: 'red', name: 'Red', palette: { body: '#ee1144' } }],
  hats: ['none'], defaults: { skin: 'red', hat: 'none' },
  anchor: { x: 0, y: 3 }, bounds: { x: 0, y: 0, width: 23, height: 24 },
  draw(pose, skin) {
    const frame = createFrame()
    put(frame, 0, 3 + pose.dy, 2, 21, skin.palette.body!)
    put(frame, 2, 22 + pose.dy, 21, 2, skin.palette.body!)
    return frame
  },
}
export const finalFixCatalog: Catalog = { ...extendedCatalog, characters: [...extendedCatalog.characters, edge] }
