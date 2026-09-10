import { expect, test } from 'bun:test'
import { createRoot } from 'solid-js'
import { sessionHost, session, user } from './fixtures/session-host'
import { createRequestView } from '../src/tui/requests'
import { watchActivity } from '../src/tui/session'
import type { Activity } from '../src/state/mood'

test('bootstrap before host hydration retains displayed child ownership for both mood and placement', async () => {
  const h = sessionHost([user()]); h.set('ready', false)
  const request = { id: 'cold', sessionID: 'child', questions: [] }
  h.api.client.question.list = (async () => ({ data: [request], request: new Request('http://fixture.local/question'), response: new Response('[]') })) as typeof h.api.client.question.list
  let waiting!: ReturnType<typeof createRequestView>; let dispose!: () => void
  createRoot(stop => { dispose = stop; waiting = createRequestView(h.api) })
  const out: Activity[] = []; const stop = watchActivity(h.api, a => out.push(a), waiting)
  try {
    await Bun.sleep(0)
    h.set('sessions', 'child', session('child', 'parent'))
    h.set('questions', 'child', [request]); h.set('ready', true)
    expect(waiting('parent')).toBe(true); expect(out.at(-1)?.waiting).toBe(true)
    h.set('route', 'child'); expect(waiting('child')).toBe(false); expect(out.at(-1)?.waiting).toBe(false)
    h.set('route', 'parent'); expect(out.at(-1)?.waiting).toBe(true)
    h.set('questions', 'child', [])
    expect(waiting('parent')).toBe(false); expect(out.at(-1)?.waiting).toBe(false)
  } finally { stop(); dispose(); expect(h.listeners()).toBe(0) }
})

test('state-only clearances and asked-before-sync races release history without losing overlapping requests', async () => {
  const h = sessionHost([user()]); let waiting!: ReturnType<typeof createRequestView>; let dispose!: () => void
  createRoot(stop => { dispose = stop; waiting = createRequestView(h.api) })
  try {
    await Bun.sleep(0)
    h.set('sessions', 'child', session('child', 'parent'))
    const question = { id: 'same-id', sessionID: 'child', questions: [] }
    const permission = { id: 'same-id', sessionID: 'child', permission: 'read', patterns: [], always: [], metadata: {} }
    h.send({ id: 'before-sync', type: 'question.asked', properties: question })
    h.set('questions', 'child', [question])
    h.set('permissions', 'child', [permission]); h.send({ id: 'permission', type: 'permission.asked', properties: permission })
    await Bun.sleep(0); expect(waiting('parent')).toBe(true)
    h.set('questions', 'child', []); h.send({ id: 'reply', type: 'question.replied', properties: { sessionID: 'child', requestID: question.id, answers: [] } })
    expect(waiting('parent')).toBe(true)
    h.set('permissions', 'child', []); expect(waiting('parent')).toBe(false)
    // Automatically handled asks may never be inserted into displayed state.
    for (let i = 0; i < 300; i++) h.send({ id: `auto-${i}`, type: 'permission.asked', properties: { ...permission, id: `p-${i}`, sessionID: `background-${i}` } })
    await Bun.sleep(0)
    let lookups = 0; const get = h.api.state.session.get
    h.api.state.session.get = id => { lookups++; return get(id) }
    expect(waiting('parent')).toBe(false); expect(lookups).toBe(1)
  } finally { dispose(); expect(h.listeners()).toBe(0) }
})

test('a stale bootstrap response cannot resurrect cleared background ownership', async () => {
  const h = sessionHost([user()]); const request = { id: 'stale', sessionID: 'background', questions: [] }
  let release!: (value: { data: typeof request[] }) => void
  const pending = new Promise<{ data: typeof request[] }>(resolve => { release = resolve })
  h.api.client.question.list = (async () => ({ ...await pending, request: new Request('http://fixture.local/question'), response: new Response('[]') })) as typeof h.api.client.question.list
  let waiting!: ReturnType<typeof createRequestView>; let dispose!: () => void
  createRoot(stop => { dispose = stop; waiting = createRequestView(h.api) })
  try {
    h.send({ id: 'asked', type: 'question.asked', properties: request })
    h.send({ id: 'rejected', type: 'question.rejected', properties: { sessionID: request.sessionID, requestID: request.id } })
    release({ data: [request] }); await Bun.sleep(0)
    let lookups = 0; const get = h.api.state.session.get
    h.api.state.session.get = id => { lookups++; return get(id) }
    expect(waiting('parent')).toBe(false); expect(lookups).toBe(1)
  } finally { dispose() }
})
