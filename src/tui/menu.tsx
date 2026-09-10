import type { TuiPluginApi, TuiDialogSelectOption } from '@opencode-ai/plugin/tui'
import { catalog } from '../art/catalog'
import { normalizePreferences, selectCharacter, type Preferences } from '../state/preferences'
import { appearanceOptions } from './menu-options'

export function registerPalsMenu(api: TuiPluginApi, get: () => Preferences, set: (value: Preferences) => void): () => void {
  let disposed = false
  const accept = (p: Preferences) => {
    if (disposed) return
    set(normalizePreferences(p, catalog))
    api.ui.dialog.clear()
  }
  const pick = (kind: 'character' | 'skin' | 'hat') => {
    api.ui.dialog.replace(() => <api.ui.DialogSelect title={`Pals ${kind}`} options={appearanceOptions(catalog, get(), kind)}
      current={kind === 'character' ? get().character : get().appearances[get().character]![kind]}
      onSelect={option => {
        const p = get()
        accept(kind === 'character' ? selectCharacter(p, option.value, catalog) : {
          ...p, appearances: { ...p.appearances, [p.character]: { ...p.appearances[p.character]!, [kind]: option.value } },
        })
      }} />)
  }
  const open = () => {
    if (disposed) return
    api.ui.dialog.replace(() => {
      const options = (): TuiDialogSelectOption<string>[] => {
        const p = get(); const c = catalog.characters.find(c => c.id === p.character)!
        const label = (kind: 'character' | 'skin' | 'hat') => appearanceOptions(catalog, p, kind).find(o => o.description === 'Current')!.title
        return [
          { title: p.enabled ? 'Hide Pal (shown)' : 'Show Pal (hidden)', value: 'enabled' },
          { title: `Character: ${label('character')}`, value: 'character' },
          { title: `Skin: ${label('skin')}`, value: 'skin', description: c.skins.length === 1 ? 'Only one skin available for this character' : undefined },
          { title: `Hat: ${label('hat')}`, value: 'hat' },
          { title: p.animate ? 'Pause Pal (animation on)' : 'Animate Pal (paused)', value: 'animate',
            description: api.kv.get('animations_enabled', true) ? undefined : 'Host animations are disabled' },
          { title: 'Reset appearance to defaults', value: 'reset' },
        ]
      }
      return <api.ui.DialogSelect title="Pals settings" options={options()} onSelect={option => {
        const p = get()
        if (option.value === 'enabled' || option.value === 'animate') accept({ ...p, [option.value]: !p[option.value] })
        else if (option.value === 'reset') {
          const c = catalog.characters.find(c => c.id === p.character)!
          accept({ ...p, appearances: { ...p.appearances, [p.character]: { ...c.defaults } } })
        } else if (option.value === 'character' || option.value === 'skin' || option.value === 'hat') pick(option.value)
      }} />
    })
  }
  const unregister = api.keymap.registerLayer({ commands: [{ name: 'opencode-pals.settings', title: 'Pals settings',
    namespace: 'palette', category: 'Pals', slashName: 'pals', run: open }] })
  return () => { if (disposed) return; disposed = true; unregister() }
}
