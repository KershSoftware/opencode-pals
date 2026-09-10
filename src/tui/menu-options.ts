import type { TuiDialogSelectOption } from '@opencode-ai/plugin/tui'
import type { Catalog } from '../art/types'
import type { Preferences } from '../state/preferences'

export function appearanceOptions(catalog: Catalog, p: Preferences, kind: 'character' | 'skin' | 'hat'): TuiDialogSelectOption<string>[] {
  const character = catalog.characters.find(c => c.id === p.character)!
  const current = kind === 'character' ? p.character : p.appearances[p.character]![kind]
  const entries = kind === 'character' ? catalog.characters : kind === 'skin' ? character.skins :
    [{ id: 'none', name: 'None' }, ...catalog.hats.filter(h => h.id !== 'none' && character.hats.includes(h.id))]
  return entries.map(e => ({ title: e.name, value: e.id, description: e.id === current ? 'Current' : undefined }))
}
