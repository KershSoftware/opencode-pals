// Bundled only by try-pal.ts; production builds never import this wrapper.
import type { TuiPluginModule } from '@opencode-ai/plugin/tui'
import { createSignal } from 'solid-js'
import plugin from '../src/tui/index'
import { catalog } from '../src/art/catalog'
import { poseAt } from '../src/art/timeline'
import type { Mood, Pose } from '../src/art/types'
import { preferenceKey, type Preferences } from '../src/state/preferences'
import { trialMoods, type PalTrial } from './native-trial'
import { forceTrialPose } from './trial-pose'

export function trialPlugin(trial: PalTrial): TuiPluginModule {
  return { id: plugin.id, async tui(api, options) {
    const originalCharacters = catalog.characters; const originalHats = catalog.hats
    const [mood, setMood] = createSignal<Mood>('idle')
    let since = performance.now()
    const forced = (): Pose => {
      const selected = mood()
      return { ...poseAt(selected, performance.now() - since,
        (api.kv.get<Preferences>(preferenceKey)?.animate ?? true) && api.kv.get('animations_enabled', true)), mood: selected }
    }
    const hats = new Map(originalHats.map(h => [h.id, h]))
    for (const hat of trial.hats ?? []) hats.set(hat.id, hat)
    Object.assign(catalog, forceTrialPose({
      characters: [trial.character, ...originalCharacters.filter(c => c.id !== trial.character.id)],
      hats: [...hats.values()],
    }, forced))
    api.lifecycle.onDispose(() => { catalog.characters = originalCharacters; catalog.hats = originalHats })
    let sessionID: string | undefined
    api.lifecycle.onDispose(api.keymap.registerLayer({ commands: [{
      name: 'opencode-pals.trial-mood', title: 'Pals trial mood', namespace: 'palette', category: 'Pals trial', slashName: 'pals-trial',
      run: () => api.ui.dialog.replace(() => <api.ui.DialogSelect<string> title="Pals trial mood (temporary, no providers)"
        current={mood()} options={[
          ...trialMoods.map(value => ({ title: value, value })),
          { title: 'View home', value: 'home' },
          { title: 'View sidebar (empty local session)', value: 'sidebar' },
        ]} onSelect={async option => {
          api.ui.dialog.clear()
          if (option.value === 'home') api.route.navigate('home')
          else if (option.value === 'sidebar') {
            if (!sessionID) sessionID = (await api.client.session.create({ title: 'Pals temporary visual trial' })).data?.id
            if (sessionID) { api.kv.set('sidebar', 'auto'); api.route.navigate('session', { sessionID }) }
          } else { since = performance.now(); setMood(option.value as Mood) }
        }} />),
    }] }))
    await plugin.tui(api, options)
  } }
}
