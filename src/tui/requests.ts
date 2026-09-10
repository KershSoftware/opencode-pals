import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import { createComputed, createSignal, onCleanup, untrack } from 'solid-js'

/** One activation-owned view shared by activity and layout. Retain outstanding
 * ownership only; host reactive state decides which requests are displayed. */
export function createRequestView(api: TuiPluginApi) {
  const owners = new Map<string, Map<string, boolean>>()
  const [version, setVersion] = createSignal(0)
  const changed = () => setVersion(value => value + 1)
  let disposed = false
  let queued = false
  const remember = (sessionID: string, kind: string, id: string) => {
    const owner = owners.get(sessionID) ?? new Map<string, boolean>()
    const key = `${kind}:${id}`
    if (!owner.has(key)) owner.set(key, false)
    owners.set(sessionID, owner); changed()
  }
  const finish = (sessionID: string, kind: string, id: string) => {
    const owner = owners.get(sessionID)
    if (!owner) return
    owner.delete(`${kind}:${id}`)
    if (!owner.size) owners.delete(sessionID)
    changed()
  }
  onCleanup(api.event.on('permission.asked', e => remember(e.properties.sessionID, 'permission', e.properties.id)))
  onCleanup(api.event.on('question.asked', e => remember(e.properties.sessionID, 'question', e.properties.id)))
  onCleanup(api.event.on('permission.replied', e => finish(e.properties.sessionID, 'permission', e.properties.requestID)))
  onCleanup(api.event.on('question.replied', e => finish(e.properties.sessionID, 'question', e.properties.requestID)))
  onCleanup(api.event.on('question.rejected', e => finish(e.properties.sessionID, 'question', e.properties.requestID)))
  onCleanup(api.event.on('session.deleted', e => { if (owners.delete(e.properties.info.id)) changed() }))
  onCleanup(() => { disposed = true; owners.clear() })
  const reconcile = (settled: boolean) => {
    const ready = api.state.ready
    let removed = false
    let pending = false
    for (const [id, owner] of owners) {
      const outstanding = new Set([
        ...api.state.session.permission(id).map(r => `permission:${r.id}`),
        ...api.state.session.question(id).map(r => `question:${r.id}`),
      ])
      // Also release ownership on reactive state clearance (automatic handling
      // need not send a reply to this subscriber). An asked event may precede sync.
      for (const [key, observed] of owner) {
        if (outstanding.has(key)) owner.set(key, true)
        else if (observed || (settled && ready)) owner.delete(key)
        else pending = true
      }
      if (!owner.size) { owners.delete(id); removed = true }
    }
    if (removed) untrack(changed)
    // Host event handlers synchronously update sync, but their subscriber order
    // is not ours to choose. Give unseen asks one event-turn to reach state.
    // Once hydrated, automatically handled/never-displayed requests are retired
    // too. There is at most one queued reconciliation for the whole activation.
    if (pending && ready && !queued) {
      queued = true
      queueMicrotask(() => { if (!disposed) reconcile(true); queued = false })
    }
  }
  createComputed(() => {
    version()
    reconcile(false)
  })
  void Promise.all([api.client.permission.list(), api.client.question.list()]).then(([p, q]) => {
    if (disposed || api.lifecycle.signal.aborted) return
    // A reply can overtake the bootstrap response. Never resurrect its stale
    // candidate; public state remains authoritative, including cold child entry.
    for (const request of p.data ?? []) if (!api.state.ready || api.state.session.permission(request.sessionID).some(r => r.id === request.id)) remember(request.sessionID, 'permission', request.id)
    for (const request of q.data ?? []) if (!api.state.ready || api.state.session.question(request.sessionID).some(r => r.id === request.id)) remember(request.sessionID, 'question', request.id)
  }).catch(() => { /* Live state/events remain usable without bootstrap. */ })
  return (sessionID: string): boolean => {
    version()
    if (!sessionID || api.state.session.get(sessionID)?.parentID) return false
    const outstanding = (id: string) => api.state.session.permission(id).length > 0 || api.state.session.question(id).length > 0
    return outstanding(sessionID) || [...owners.keys()].some(id => id !== sessionID &&
      api.state.session.get(id)?.parentID === sessionID && outstanding(id))
  }
}
export type RequestView = ReturnType<typeof createRequestView>
