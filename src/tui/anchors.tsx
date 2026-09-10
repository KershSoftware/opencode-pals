import type { TuiPluginApi, TuiHostSlotMap } from '@opencode-ai/plugin/tui'
import { BoxRenderable, Renderable, ScrollBoxRenderable, rgbToHex } from '@opentui/core'
import { createMemo, createSignal, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js'
import type { Character, Frame } from '../art/types'
import { PetView } from './pet-view'
import { choosePerch, perchFrame, perchGeometry, waitingFits } from './placement'
import { normalizePreferences, preferenceKey } from '../state/preferences'
import { catalog } from '../art/catalog'
import type { RequestView } from './requests'

// Copied from pinned v1.18.30 routes/home.tsx, not Prompt's generic defaults.
export const homePlaceholders = {
  normal: ['Fix a TODO in the codebase', 'What is the tech stack of this project?', 'Fix broken tests'],
  shell: ['ls -la', 'git status', 'pwd'],
}

function visible(node: Renderable | undefined, width: number, height: number, required: number): boolean {
  if (!node || node.isDestroyed || node.width < required || node.x < 0 || node.x + node.width > width) return false
  for (let current: Renderable | null = node; current; current = current.parent) {
    if (!current.visible || current.isDestroyed) return false
  }
  return node.y >= 0 && node.y < height
}

export function createAnchors(api: TuiPluginApi, frame: Accessor<Frame>, bounds: Accessor<Character['bounds']>, requests: RequestView) {
  const geometry = createMemo(() => perchGeometry(bounds()))
  const nativeFrame = createMemo(() => perchFrame(frame(), geometry()))
  const sidebars = new Set<BoxRenderable>()
  const prompts = new Map<BoxRenderable, { home: boolean; visible: () => boolean; reserved: () => number }>()
  let scroll: ScrollBoxRenderable | undefined
  let scrollSession: string | undefined
  let waitingBox: BoxRenderable | undefined
  type Layout = { sidebar?: BoxRenderable; prompt?: BoxRenderable; home?: BoxRenderable; fits: boolean; waitingFits: boolean }
  const [layout, setLayout] = createSignal<Layout>({ fits: false, waitingFits: false }, {
    equals: (a, b) => a.sidebar === b.sidebar && a.prompt === b.prompt && a.home === b.home && a.fits === b.fits && a.waitingFits === b.waitingFits,
  })
  const route = () => api.route.current.name === 'home' ? 'home' : api.route.current.name === 'session' ? 'session' : 'other'
  const sessionID = () => { const current = api.route.current; return 'params' in current ? String(current.params?.sessionID ?? '') : '' }
  const waiting = () => route() === 'session' && requests(sessionID())
  const perch = createMemo(() => choosePerch({
    enabled: normalizePreferences(api.kv.get(preferenceKey), catalog).enabled, fits: layout().fits,
    dialogOpen: api.ui.dialog.open, route: route(), sidebarVisible: !!layout().sidebar,
    promptVisible: !!layout().prompt, waiting: waiting() && layout().waitingFits,
  }))
  const sample = () => {
    const { width, height } = api.renderer
    const sidebar = [...sidebars].find(node => visible(node, width, height, geometry().width))
    const home = [...prompts].find(([node, state]) => state.home && visible(node, width, height, geometry().width))?.[0]
    const prompt = [...prompts].find(([node, state]) => {
      if (state.home || !state.visible() || !visible(node, width, height, geometry().width)) return false
      // Discover the actual session scroll sibling through public parent/children
      // bounds while the prompt exists; retain it across host prompt replacement.
      for (let parent = node.parent; parent; parent = parent.parent) {
        const sibling = parent.getChildren().find(child => child instanceof ScrollBoxRenderable)
        if (sibling instanceof ScrollBoxRenderable) {
          scroll = sibling
          scrollSession = sessionID()
          break
        }
      }
      return scrollSession === sessionID() && !!scroll && !scroll.isDestroyed &&
        scroll.getLayoutNode().getComputedHeight() + state.reserved() >= geometry().rows
    })?.[0]
    if (waiting() && (scrollSession !== sessionID() || !scroll || scroll.isDestroyed)) {
      // Cold entry during a request: pinned Session's message scroll is the
      // unique bottom-sticky ScrollBox. Ambiguity deliberately hides the pet.
      const candidates: ScrollBoxRenderable[] = []
      const visit = (node: Renderable) => {
        if (node instanceof ScrollBoxRenderable && node.stickyScroll && node.stickyStart === 'bottom') candidates.push(node)
        for (const child of node.getChildren()) visit(child)
      }
      visit(api.renderer.root)
      if (candidates.length === 1) { scroll = candidates[0]; scrollSession = sessionID() }
    }
    const measured = scrollSession === sessionID() && scroll && !scroll.isDestroyed && visible(scroll, width, height, geometry().width) ? scroll : undefined
    setLayout({ sidebar, prompt, home, fits: width >= 32 && height >= (route() === 'home' ? 32 : 24),
      // Renderable.height clamps zero-sized renderables to one. Yoga's PUBLIC
      // computed bounds retain the true zero and prevent over-reservation.
      waitingFits: waitingFits(measured ? { width: measured.width, height: measured.getLayoutNode().getComputedHeight() } : undefined,
        perch() === 'waiting' ? waitingBox?.getLayoutNode().getComputedHeight() ?? 0 : 0, geometry()) })
  }
  // Observe completed host layouts passively: this does not request a live
  // renderer or another interval. Equal measurements never invalidate Solid.
  let disposed = false
  let queued = false
  const afterLayout = () => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => { queued = false; if (!disposed) sample() })
  }
  api.renderer.addPostProcessFn(afterLayout)
  onCleanup(() => { disposed = true; api.renderer.removePostProcessFn(afterLayout) })

  function PromptAnchor(props: { home: boolean; slot: TuiHostSlotMap['session_prompt'] | TuiHostSlotMap['home_prompt'] }) {
    let node!: BoxRenderable
    let reservation!: BoxRenderable
    const slot = () => props.slot as TuiHostSlotMap['session_prompt']
    const active = () => perch() === (props.home ? 'home' : 'prompt') && node === (props.home ? layout().home : layout().prompt)
    onMount(() => { prompts.set(node, { home: props.home, visible: () => slot().visible !== false,
      reserved: () => reservation.getLayoutNode().getComputedHeight() }); sample() })
    onCleanup(() => { prompts.delete(node); sample() })
    return (
      <box ref={node} id={props.home ? 'jelly-home-anchor' : 'jelly-prompt-anchor'} flexShrink={0}>
        <box ref={reservation} height={active() ? geometry().rows - 1 : 0} minHeight={0} flexShrink={0} />
        {/* The host Prompt is never inside the pet's changing Show. */}
        <api.ui.Prompt ref={ref => props.slot.ref?.(ref)} sessionID={slot().session_id}
          visible={slot().visible} disabled={slot().disabled} onSubmit={slot().on_submit}
          placeholders={props.home ? homePlaceholders : undefined}
          right={props.home ? <api.ui.Slot name="home_prompt_right" /> : <api.ui.Slot name="session_prompt_right" session_id={slot().session_id} />} />
        <Show when={active()}>
          <box id="jelly-pet-prompt" position="absolute" top={0} right={0} width={geometry().width} height={geometry().rows} zIndex={1} overflow="hidden">
            <PetView frame={nativeFrame()} pixelOffsetY={1} background={(_x, y) => rgbToHex(y >= geometry().height ? api.theme.current.backgroundElement : api.theme.current.background)} />
          </box>
        </Show>
      </box>
    )
  }
  function SidebarAnchor(props: { children: JSX.Element }) {
    let node!: BoxRenderable
    onMount(() => { sidebars.add(node); sample() })
    onCleanup(() => { sidebars.delete(node); sample() })
    return <box ref={node} id="jelly-sidebar-anchor" flexShrink={0} gap={0}>
      <Show when={perch() === 'sidebar' && layout().sidebar === node}>
        <box id="jelly-pet-sidebar" height={geometry().rows} marginBottom={1} alignItems="flex-start" paddingTop={1} flexShrink={0}>
          <PetView frame={nativeFrame()} background={() => rgbToHex(api.theme.current.backgroundPanel)} />
        </box>
      </Show>
      {props.children}
    </box>
  }
  function WaitingAnchor() {
    onCleanup(() => { waitingBox = undefined })
    return <box ref={node => { waitingBox = node }} id="jelly-waiting-anchor" height={perch() === 'waiting' ? geometry().rows : 0}
      visible={perch() === 'waiting'} minHeight={0} flexShrink={0} alignItems="flex-end" overflow="hidden">
      <Show when={perch() === 'waiting'}>
        <box id="jelly-pet-waiting" paddingTop={1}>
          <PetView frame={nativeFrame()} background={() => rgbToHex(api.theme.current.background)} />
        </box>
      </Show>
    </box>
  }
  return { PromptAnchor, SidebarAnchor, WaitingAnchor }
}
