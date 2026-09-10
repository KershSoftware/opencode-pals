import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui'
import { createComputed, createMemo, createRoot, createSignal, onCleanup, untrack } from 'solid-js'
import { catalog } from '../art/catalog'
import { compose } from '../art/compose'
import { decorateFooter } from './footer'
import { createAnchors } from './anchors'
import { createPetAnimator } from './animation'
import { watchActivity } from './session'
import { loadPreferences, normalizePreferences, preferenceKey, selectedAppearance } from '../state/preferences'
import { registerPalsMenu } from './menu'
import { createRequestView } from './requests'

const tui: TuiPlugin = async (api) => {
  const { PromptAnchor, SidebarAnchor, WaitingAnchor } = createRoot(dispose => {
    api.lifecycle.onDispose(dispose)
    const get = createMemo(() => loadPreferences(key => api.kv.get(key), catalog))
    // Wait for host hydration before repairing missing/removed saved IDs.
    createComputed(() => {
      if (!api.kv.ready) return
      const saved = api.kv.get(preferenceKey); const value = get()
      if (JSON.stringify(saved) !== JSON.stringify(value)) untrack(() => api.kv.set(preferenceKey, value))
    })
    onCleanup(registerPalsMenu(api, get, value => api.kv.set(preferenceKey, normalizePreferences(value, catalog))))
    const defaults = selectedAppearance(get())
    const [frame, setFrame] = createSignal(compose(catalog, defaults, 'idle', 0, false))
    const animator = createPetAnimator(setFrame)
    onCleanup(animator.dispose)
    createComputed(() => animator.configure(selectedAppearance(get()),
      get().animate && api.kv.get('animations_enabled', true), get().enabled))
    const requests = createRequestView(api)
    onCleanup(watchActivity(api, animator.update, requests))
    return createAnchors(api, frame, () => catalog.characters.find(character => character.id === get().character)!.bounds, requests)
  })
  decorateFooter(api, original => (ctx, props) => (
    <SidebarAnchor>{original(ctx, props)}</SidebarAnchor>
  ))
  // OpenTUI 0.4.5's mounted Slot subscribers sample the first registry change
  // synchronously and suppress further notifications until a microtask. Let the
  // footer probe's notification drain before publishing the visible slots.
  await Promise.resolve()
  if (api.lifecycle.signal.aborted) return
  api.slots.register({ slots: {
    home_prompt: (_ctx, props) => <PromptAnchor home={true} slot={props} />,
    session_prompt: (_ctx, props) => <PromptAnchor home={false} slot={props} />,
    app_bottom: () => <WaitingAnchor />,
  } })
}

export default { id: 'opencode-pals', tui } satisfies TuiPluginModule
