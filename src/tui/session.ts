import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import type { AssistantMessage } from '@opencode-ai/sdk/v2'
import { createComputed, createRoot, createSignal, onCleanup, untrack } from 'solid-js'
import type { Activity } from '../state/mood'
import { normalizePreferences, preferenceKey } from '../state/preferences'
import { catalog } from '../art/catalog'
import { createRequestView, type RequestView } from './requests'

type MessageOrder = { id: string; time: { created: number } }
const order = (a: MessageOrder, b: MessageOrder) => a.time.created - b.time.created || a.id.localeCompare(b.id)
function terminal(message: AssistantMessage | undefined): Activity['outcome'] {
  if (message?.error) return message.error.name === 'MessageAbortedError' ? 'aborted' : 'error'
  // The SDK deliberately types finish as string. Only known successful reasons
  // qualify; tool-calls continues the same user turn, and length is not success.
  return message?.time.completed !== undefined && ['stop', 'end-turn'].includes(message.finish ?? '') ? 'success' : null
}

/** Pinned 1.18.30 public reactive state + event-only session errors. */
export function watchActivity(api: TuiPluginApi, emit: (activity: Activity) => void, requests?: RequestView): () => void {
  let disposed = false
  const disposeRoot = createRoot(dispose => {
    const requestView = requests ?? createRequestView(api)
    const [error, setError] = createSignal<{ sessionID: string; outcome: Activity['outcome']; sequence: number }>()
    // Baselines reset presentation, not delivery history. Bound watcher-owned
    // history to 64 recently handled sessions and 256 event IDs per session.
    // Oldest entries may be accepted again after eviction; deletion/disposal
    // releases their history. No message bodies or historical turns are cached.
    const seenErrors = new Map<string, Set<string>>()
    onCleanup(() => seenErrors.clear())
    let sequence = 0
    onCleanup(api.event.on('session.deleted', e => {
      seenErrors.delete(e.properties.info.id)
    }))
    onCleanup(api.event.on('session.error', e => {
      const route = api.route.current
      const id = e.properties.sessionID
      if (route.name !== 'session' ||
        !id || id !== route.params?.sessionID || !e.properties.error) return
      const seen = seenErrors.get(id) ?? new Set<string>()
      if (seen.has(e.id)) return
      seen.add(e.id)
      if (seen.size > 256) seen.delete(seen.values().next().value!)
      seenErrors.delete(id)
      seenErrors.set(id, seen)
      if (seenErrors.size > 64) seenErrors.delete(seenErrors.keys().next().value!)
      // Delivery while hidden still counts as history, never a fresh effect on show.
      if (!normalizePreferences(api.kv.get(preferenceKey), catalog).enabled) return
      setError({ sessionID: id, outcome: e.properties.error.name === 'MessageAbortedError' ? 'aborted' : 'error', sequence: ++sequence })
    }))
    let scope: string | undefined
    let turnID: string | null = null
    let frontier: MessageOrder | undefined
    let live = false
    let outcome: Activity['outcome'] = null
    let previous = ''
    let previousProgress = ''
    let previousBusy = false
    let lastError = 0
    let lastTerminal = ''
    let lastEmission = ''
    createComputed(() => {
      const route = api.route.current
      const enabled = normalizePreferences(api.kv.get(preferenceKey), catalog).enabled
      const sessionID = enabled && route.name === 'session' ? String(route.params?.sessionID ?? '') : ''
      const currentScope = `${enabled}:${sessionID}`
      const baseline = scope !== currentScope
      const messages = sessionID ? [...new Map(api.state.session.messages(sessionID)
        .filter(m => m.sessionID === sessionID).map(m => [m.id, m])).values()].sort(order) : []
      const user = messages.findLast(m => m.role === 'user')
      // Keep one ordering watermark rather than old turn identities. Replayed
      // historical windows cannot take ownership from the active turn, even
      // after the controller's recent-ID cache has evicted those turns.
      if (baseline) frontier = undefined
      if (user && (!frontier || order(user, frontier) > 0)) frontier = { id: user.id, time: { created: user.time.created } }
      // Sync's sliding window can evict the current user while retaining its
      // assistants. Absence is not a successor; retain only within this scope.
      const nextTurn = frontier?.id ?? (baseline ? null : turnID)
      const assistants = messages.filter((m): m is AssistantMessage => m.role === 'assistant' && !m.summary && m.parentID === nextTurn)
      const latest = assistants.at(-1)
      const parts = assistants.flatMap(m => api.state.part(m.id).filter(p => p.sessionID === sessionID && p.messageID === m.id))
      const tools = [...new Map(parts.filter(p => p.type === 'tool').map(p => [p.id, p])).values()]
      const runningTools = tools.filter(p => p.state.status === 'running').map(p => p.id).sort()
      const status = sessionID ? api.state.session.status(sessionID) : undefined
      const busy = status?.type === 'busy' || status?.type === 'retry'
      const retry = status?.type === 'retry'
      const waiting = requestView(sessionID)
      const fromState = terminal(latest)
      const terminalKey = fromState ? JSON.stringify([latest?.id, fromState, latest?.time.completed, latest?.error]) : ''
      // A changed live nonterminal message/part or a real idle/retry -> busy
      // transition can recover. A repeated terminal with stale busy cannot.
      const progress = JSON.stringify([latest && !fromState ? latest : null, parts.filter(p => p.type !== 'tool' || p.state.status === 'running')])
      const fingerprint = JSON.stringify([nextTurn, busy, retry, waiting, runningTools, terminalKey, progress])
      const eventError = error()
      if (baseline || (nextTurn !== null && turnID !== nextTurn)) {
        if (baseline) live = false
        else live = true
        scope = currentScope; turnID = nextTurn; outcome = fromState
        lastTerminal = terminalKey
        lastError = eventError?.sequence ?? 0
      } else {
        if (fingerprint !== previous) live = true
        if (outcome === 'error' && ((status?.type === 'busy' && !previousBusy && terminalKey === lastTerminal) ||
          (!fromState && progress !== previousProgress && (!!latest || runningTools.length > 0)))) outcome = null
        if (terminalKey && terminalKey !== lastTerminal) { outcome = fromState; lastTerminal = terminalKey }
        if (eventError?.sessionID === sessionID && eventError.sequence !== lastError) {
          outcome = eventError.outcome; live = true; lastError = eventError.sequence
        }
      }
      previous = fingerprint; previousProgress = progress; previousBusy = busy && !retry
      const activity: Activity = { sessionID, turnID: nextTurn, observedLive: live, busy, waiting, retry, runningTools, outcome }
      const serialized = JSON.stringify(activity)
      if (serialized !== lastEmission || baseline) { lastEmission = serialized; untrack(() => emit(activity)) }
    })
    return dispose
  })
  const dispose = () => { if (disposed) return; disposed = true; unregister(); disposeRoot() }
  const unregister = api.lifecycle.onDispose(dispose)
  return dispose
}
