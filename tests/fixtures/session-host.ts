import * as store from 'solid-js/store'
import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import type { Event, Message, Part, PermissionRequest, QuestionRequest, Session, SessionStatus } from '@opencode-ai/sdk/v2'
import { session } from './sdk-data'
import { preferenceKey } from '../../src/state/preferences'
export { user, assistant, session } from './sdk-data'
export function sessionHost(initial: Message[] = []) {
  const [state, set] = store.createStore({ ready: true, route: 'parent', enabled: true, animate: false,
    messages: { parent: initial } as Record<string, Message[]>, parts: {} as Record<string, Part[]>,
    statuses: {} as Record<string, SessionStatus>, sessions: { parent: session('parent') } as Record<string, Session>,
    permissions: {} as Record<string, PermissionRequest[]>, questions: {} as Record<string, QuestionRequest[]> })
  const handlers = new Map<string, Set<(event: Event) => void>>()
  const abort = new AbortController()
  const cleanups = new Set<() => void>()
  const api = {
    route: { get current() { return state.route ? { name: 'session', params: { sessionID: state.route } } : { name: 'home' } } },
    kv: { get(key: string, fallback: unknown) { return key === preferenceKey ? { enabled: state.enabled, animate: state.animate } : fallback } },
    state: { get ready() { return state.ready }, session: { get: (id: string) => state.sessions[id], messages: (id: string) => state.messages[id] ?? [], status: (id: string) => state.statuses[id], permission: (id: string) => state.permissions[id] ?? [], question: (id: string) => state.questions[id] ?? [] }, part: (id: string) => state.parts[id] ?? [] },
    event: { on(type: string, handler: (event: Event) => void) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type)!.add(handler); return () => { handlers.get(type)!.delete(handler) } } },
    client: { permission: { list: async () => ({ data: Object.values(state.permissions).flat() }) }, question: { list: async () => ({ data: Object.values(state.questions).flat() }) } },
    lifecycle: { signal: abort.signal, onDispose(fn: () => void) { cleanups.add(fn); return () => { cleanups.delete(fn) } } },
  } as unknown as TuiPluginApi
  return { api, state, set, send(event: Event) { for (const handler of handlers.get(event.type) ?? []) handler(event) }, listeners: () => [...handlers.values()].reduce((n, h) => n + h.size, 0), dispose() { abort.abort(); for (const fn of cleanups) fn() } }
}
