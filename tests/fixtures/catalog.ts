import { catalog } from '../../src/art/catalog'
import type { Catalog, Character } from '../../src/art/types'
import { createFrame, put } from '../../src/art/raster'

// Test-only artwork; deliberately unlike the approved jelly.
const sprout: Character = {
  id: 'sprout', name: 'Test sprout',
  skins: [{ id: 'green', name: 'Green', palette: { body: '#00aa44' } },
    { id: 'gold', name: 'Gold', palette: { body: '#ffaa00' } }],
  hats: ['none'], defaults: { skin: 'green', hat: 'none' },
  anchor: { x: 12, y: 12 }, bounds: { x: 10, y: 13, width: 4, height: 7 },
  draw(pose, skin) { const frame = createFrame(); put(frame, 10, 16 + pose.dy, 4, 4, skin.palette.body!); return frame },
}
export const extendedCatalog: Catalog = { ...catalog, characters: [...catalog.characters, sprout] }
