import { expect, test } from 'bun:test'
import { assistant, session, sessionHost, user } from './fixtures/session-host'
import { watchActivity } from '../src/tui/session'
import type { Activity } from '../src/state/mood'
import type { AssistantMessage, ToolPart } from '@opencode-ai/sdk/v2'
import { createMoodController } from '../src/state/mood'

const idle: Activity = { sessionID: 'parent', turnID: 'user-1', observedLive: false, busy: false, waiting: false, retry: false, runningTools: [], outcome: null }
test('300 resolved background request sessions do not increase future sampling cost', async () => {
  const h = sessionHost([user()]); const out: Activity[] = []
  const stop = watchActivity(h.api, a => out.push(a))
  await Bun.sleep(0)
  for (let i = 0; i < 300; i++) {
    const id = `background-${i}`
    h.set('sessions', id, session(id))
    const request = { id: `q-${i}`, sessionID: id, questions: [] }
    h.set('questions', id, [request])
    h.send({ id: `asked-${i}`, type: 'question.asked', properties: request })
    h.set('questions', id, [])
    h.send({ id: `cleared-${i}`, type: 'question.rejected', properties: { sessionID: id, requestID: request.id } })
  }
  let lookups = 0
  const get = h.api.state.session.get
  h.api.state.session.get = id => { lookups++; return get(id) }
  h.set('statuses', 'parent', { type: 'busy' })
  expect(lookups).toBeLessThanOrEqual(2)
  expect(out.at(-1)?.waiting).toBe(false)
  stop(); expect(h.listeners()).toBe(0)
})

test('ancient message windows cannot replace or misattribute the active turn after 10001 turns', () => {
  const h = sessionHost(); const c = createMoodController(); let now = 0; let latest!: Activity
  const stop = watchActivity(h.api, a => { latest = a; c.update(a, now) })
  for (let i = 0; i <= 10000; i++) {
    now = i * 2000
    h.set('messages', 'parent', [user(`long-${i}`, i * 2 + 1)])
    h.set('statuses', 'parent', { type: 'busy' })
    if (i < 10000) h.set('statuses', 'parent', { type: 'idle' })
  }
  h.set('messages', 'parent', [user('long-0', 1), { ...assistant('ancient', 'long-0', 2), finish: 'stop', time: { created: 2, completed: 3 } }])
  expect(latest.turnID).toBe('long-10000')
  expect(latest.outcome).toBeNull()
  h.set('messages', 'parent', [{ ...assistant('current', 'long-10000', 20002), finish: 'stop', time: { created: 20002, completed: 20003 } }])
  h.set('statuses', 'parent', { type: 'idle' })
  expect(c.current(now).mood).toBe('done')
  now += 2000
  h.set('statuses', 'parent', { type: 'busy' }); h.set('statuses', 'parent', { type: 'idle' })
  expect(c.current(now).mood).toBe('idle')
  stop()
})
test('R1: a 100-assistant sliding window retains the observed turn, tool and completion', () => {
  const h = sessionHost([user(), assistant()]); const out: Activity[] = []
  const controller = createMoodController(); let now = 0
  const stop = watchActivity(h.api, a => { out.push(a); if (!a.observedLive) controller.reset(); controller.update(a, now) })
  h.set('statuses', 'parent', { type: 'busy' })
  h.set('parts', 'assistant-1', [{ id: 'tool', sessionID: 'parent', messageID: 'assistant-1', callID: 'call', type: 'tool', tool: 'read', state: { status: 'running', input: {}, time: { start: 3 } } }])
  const working = { ...idle, observedLive: true, busy: true, runningTools: ['tool'] }
  expect(out.at(-1)).toEqual(working)
  const window = Array.from({ length: 100 }, (_, i) => assistant(`assistant-${i + 1}`, 'user-1', i + 2))
  h.set('messages', 'parent', window)
  expect(out.at(-1)).toEqual(working)
  now = 300; expect(controller.current(now).mood).toBe('working')
  h.set('messages', 'parent', [...window.slice(0, -1), { ...window[99]!, finish: 'stop', time: { created: 101, completed: 102 } }])
  expect(out.at(-1)).toEqual({ ...working, outcome: 'success' })
  h.set('parts', 'assistant-1', [])
  h.set('statuses', 'parent', { type: 'idle' })
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, outcome: 'success' })
  expect(controller.current(now).mood).toBe('done')
  h.set('messages', 'parent', [...window, user('successor', 200), assistant('next', 'successor', 201)])
  expect(out.at(-1)).toEqual({ ...idle, turnID: 'successor', observedLive: true })
  stop()
  // No identity inference from assistant.parentID on a cold attach or new scope.
  h.set('messages', 'parent', window)
  const cold = watchActivity(h.api, a => out.push(a))
  expect(out.at(-1)).toEqual({ ...idle, turnID: null })
  h.set('route', 'other'); h.set('route', 'parent')
  expect(out.at(-1)).toEqual({ ...idle, turnID: null })
  cold()
})

for (const name of ['UnknownError', 'MessageAbortedError'] as const) {
  test(`R2: handled ${name} cannot replay across navigation or KV baselines`, () => {
    const h = sessionHost([user()]); const out: Activity[] = []; const controller = createMoodController()
    const stop = watchActivity(h.api, a => { out.push(a); if (!a.observedLive) controller.reset(); controller.update(a, 0) })
    const event = { id: 'same-error', type: 'session.error' as const, properties: { sessionID: 'parent', error: { name, data: { message: 'controlled' } } } }
    h.send(event)
    expect(controller.current(0).mood).toBe(name === 'UnknownError' ? 'error' : 'interrupted')
    for (const reset of [() => { h.set('route', ''); h.set('route', 'parent') }, () => { h.set('enabled', false); h.set('enabled', true) }]) {
      reset(); expect(out.at(-1)).toEqual(idle)
      const before = out.length
      h.send(event)
      expect(out.length).toBe(before); expect(controller.current(0).mood).toBe('idle')
      expect(controller.nextDeadline()).toBeNull()
    }
    h.send({ ...event, id: 'genuinely-new' })
    expect(out.at(-1)).toEqual({ ...idle, observedLive: true, outcome: name === 'UnknownError' ? 'error' : 'aborted' })
    stop()
  })
}

test('error history is session-bounded and released on session deletion or watcher disposal', () => {
  const h = sessionHost([user()]); const out: Activity[] = []
  const error = (id: string, sessionID = 'parent') => ({ id, type: 'session.error' as const, properties: { sessionID, error: { name: 'UnknownError' as const, data: { message: 'controlled' } } } })
  let stop = watchActivity(h.api, a => out.push(a))
  for (let i = 0; i < 257; i++) h.send(error(`event-${i}`))
  h.set('route', ''); h.set('route', 'parent')
  let before = out.length
  h.send(error('event-256')); expect(out.length).toBe(before)
  h.send(error('event-0')); expect(out.at(-1)?.outcome).toBe('error')
  // Admit 64 additional sessions: only the 64 most recently handled remain.
  for (let i = 0; i < 64; i++) { h.set('route', `session-${i}`); h.send(error('session-event', `session-${i}`)) }
  h.set('route', 'parent'); h.send(error('event-256'))
  expect(out.at(-1)?.outcome).toBe('error')
  h.set('route', 'session-63'); before = out.length
  h.send(error('session-event', 'session-63')); expect(out.length).toBe(before)
  h.send({ id: 'deleted', type: 'session.deleted', properties: { sessionID: 'session-63', info: session('session-63') } })
  h.send(error('session-event', 'session-63')); expect(out.at(-1)?.outcome).toBe('error')
  stop(); expect(h.listeners()).toBe(0)
  stop = watchActivity(h.api, a => out.push(a))
  expect(out.at(-1)?.outcome).toBeNull()
  h.send(error('session-event', 'session-63')); expect(out.at(-1)?.outcome).toBe('error')
  stop()
})

test('normalizes current turn, continuation and tool IDs; defers successful completion until idle', () => {
  const h = sessionHost([assistant('old', 'old-user', 0), user(), assistant()])
  const out: Activity[] = []; const stop = watchActivity(h.api, a => out.push(a))
  expect(out.at(-1)).toEqual(idle)
  h.set('statuses', 'parent', { type: 'busy' })
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true })
  const tool: ToolPart = { id: 'tool-1', sessionID: 'parent', messageID: 'assistant-1', callID: 'call-1', type: 'tool', tool: 'read', state: { status: 'running', input: {}, time: { start: 3 } } }
  h.set('parts', 'assistant-1', [tool, { ...tool, id: 'unrelated', sessionID: 'other' }])
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true, runningTools: ['tool-1'] })
  h.set('messages', 'parent', [user(), { ...assistant(), finish: 'tool-calls', time: { created: 2, completed: 4 } }])
  expect(out.at(-1)?.outcome).toBeNull()
  h.set('parts', 'assistant-1', [{ ...tool, state: { status: 'completed', input: {}, output: '', title: 'fixture', metadata: {}, time: { start: 3, end: 4 } } }])
  expect(out.at(-1)?.runningTools).toEqual([])
  h.set('messages', 'parent', [assistant('final', 'user-1', 5), user(), assistant('old', 'old-user', 0)])
  h.set('messages', 'parent', [user(), { ...assistant('final', 'user-1', 5), finish: 'stop', time: { created: 5, completed: 6 } }])
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true, outcome: 'success' })
  h.set('statuses', 'parent', { type: 'idle' })
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, outcome: 'success' })
  const count = out.length; h.send({ id: 'duplicate', type: 'message.updated', properties: { sessionID: 'parent', info: h.state.messages.parent![1]! } })
  expect(out.length).toBe(count)
  stop()
})

test('retains event-only errors behind child requests; duplicate stale busy cannot recover', async () => {
  const h = sessionHost([user(), assistant()]); const out: Activity[] = []
  const stop = watchActivity(h.api, a => out.push(a))
  h.set('sessions', 'child', session('child', 'parent'))
  h.set('questions', 'child', [{ id: 'q', sessionID: 'child', questions: [] }])
  h.send({ id: 'q-event', type: 'question.asked', properties: h.state.questions.child![0]! })
  h.set('statuses', 'parent', { type: 'busy' })
  h.send({ id: 'err', type: 'session.error', properties: { sessionID: 'parent', error: { name: 'APIError', data: { message: 'controlled', isRetryable: false } } } })
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true, waiting: true, outcome: 'error' })
  h.set('questions', 'child', [])
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true, outcome: 'error' })
  h.send({ id: 'busy-duplicate', type: 'session.status', properties: { sessionID: 'parent', status: { type: 'busy' } } })
  expect(out.at(-1)?.outcome).toBe('error')
  h.set('messages', 'parent', [user(), assistant(), assistant('recovery', 'user-1', 8)])
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true })
  h.send({ id: 'err', type: 'session.error', properties: { sessionID: 'parent', error: { name: 'APIError', data: { message: 'controlled', isRetryable: false } } } })
  expect(out.at(-1)?.outcome).toBeNull()
  stop(); await Promise.resolve()
})

test('attach/re-enable baselines, unrelated sessions, null-ID abort and complete disposal', async () => {
  const h = sessionHost([user(), { ...assistant(), finish: 'stop', time: { created: 2, completed: 3 } }]); const out: Activity[] = []
  const stop = watchActivity(h.api, a => out.push(a))
  expect(out.at(-1)).toEqual({ ...idle, outcome: 'success' })
  h.send({ id: 'foreign', type: 'session.error', properties: { sessionID: 'other', error: { name: 'UnknownError', data: { message: 'irrelevant' } } } })
  expect(out.length).toBe(1)
  h.set('enabled', false); h.set('enabled', true)
  expect(out.at(-1)).toEqual({ ...idle, outcome: 'success' })
  h.set('route', 'empty')
  h.send({ id: 'abort', type: 'session.error', properties: { sessionID: 'empty', error: { name: 'MessageAbortedError', data: { message: 'interrupted' } } } })
  expect(out.at(-1)).toEqual({ ...idle, sessionID: 'empty', turnID: null, observedLive: true, outcome: 'aborted' })
  h.set('route', '')
  expect(out.at(-1)).toEqual({ ...idle, sessionID: '', turnID: null })
  stop(); stop(); const count = out.length
  h.set('route', 'parent'); await Promise.resolve()
  expect(out.length).toBe(count); expect(h.listeners()).toBe(0)
})

test('a new live user turn earns completion, but navigation into historical completion does not', () => {
  const h = sessionHost(); const controller = createMoodController(); let now = 0
  const out: Activity[] = []; const stop = watchActivity(h.api, a => { out.push(a); if (!a.observedLive) controller.reset(); controller.update(a, now) })
  h.set('statuses', 'parent', { type: 'busy' })
  h.set('messages', 'parent', [user(), assistant()])
  expect(out.at(-1)?.observedLive).toBe(true)
  now = 300; expect(controller.current(now).mood).toBe('thinking')
  h.set('messages', 'parent', [user(), { ...assistant(), finish: 'stop', time: { created: 2, completed: 3 } }])
  h.set('statuses', 'parent', { type: 'idle' })
  expect(controller.current(now).mood).toBe('done')
  h.set('route', ''); h.set('route', 'parent')
  expect(controller.current(now).mood).toBe('idle'); stop()
})

test('explicit retry then busy recovers even when the host retains the errored assistant', () => {
  const h = sessionHost([user(), assistant()]); const out: Activity[] = []; const stop = watchActivity(h.api, a => out.push(a))
  h.set('statuses', 'parent', { type: 'busy' })
  h.set('messages', 'parent', [user(), { ...assistant(), error: { name: 'UnknownError', data: { message: 'controlled' } } }])
  expect(out.at(-1)?.outcome).toBe('error')
  h.set('statuses', 'parent', { type: 'retry', attempt: 1, message: 'controlled retry', next: 100 })
  expect(out.at(-1)?.retry).toBe(true)
  h.set('statuses', 'parent', { type: 'busy' })
  expect(out.at(-1)).toEqual({ ...idle, observedLive: true, busy: true })
  stop()
})

test('permissions bootstrap direct children only, and idle/unknown finish never imply abort/success', async () => {
  const h = sessionHost([user(), assistant()]); h.set('sessions', 'child', session('child', 'parent'))
  h.set('permissions', 'child', [{ id: 'p', sessionID: 'child', permission: 'read', patterns: ['fixture'], always: [], metadata: {} }])
  const out: Activity[] = []; const stop = watchActivity(h.api, a => out.push(a)); await Bun.sleep(0)
  expect(out.at(-1)?.waiting).toBe(true)
  h.set('permissions', 'child', [])
  h.set('sessions', 'other', session('other'))
  h.set('questions', 'other', [{ id: 'q', sessionID: 'other', questions: [] }])
  h.send({ id: 'unrelated-q', type: 'question.asked', properties: h.state.questions.other![0]! })
  expect(out.at(-1)?.waiting).toBe(false)
  h.set('statuses', 'parent', { type: 'idle' })
  for (const finish of ['tool-calls', 'length', 'unknown', 'error']) {
    h.set('messages', 'parent', [user(), { ...assistant(), finish, time: { created: 2, completed: 3 } }])
    expect(out.at(-1)?.outcome).toBeNull()
  }
  h.set('messages', 'parent', [user(), { ...assistant(), finish: 'stop' }])
  expect(out.at(-1)?.outcome).toBeNull()
  stop()
})

test('every SDK assistant error variant is classified, and previous-turn errors are ignored', () => {
  const errors: NonNullable<AssistantMessage['error']>[] = [
    { name: 'ProviderAuthError', data: { providerID: 'fixture', message: 'controlled' } },
    { name: 'UnknownError', data: { message: 'controlled' } },
    { name: 'MessageOutputLengthError', data: {} },
    { name: 'StructuredOutputError', data: { message: 'controlled', retries: 1 } },
    { name: 'ContextOverflowError', data: { message: 'controlled' } },
    { name: 'ContentFilterError', data: { message: 'controlled' } },
    { name: 'APIError', data: { message: 'controlled', isRetryable: false } },
    { name: 'MessageAbortedError', data: { message: 'controlled' } },
  ]
  for (const error of errors) {
    const h = sessionHost([user(), { ...assistant(), error }]); const out: Activity[] = []
    const stop = watchActivity(h.api, a => out.push(a))
    expect(out.at(-1)).toEqual({ ...idle, outcome: error.name === 'MessageAbortedError' ? 'aborted' : 'error' })
    h.set('messages', 'parent', [user('user-2', 10), assistant('new', 'user-2', 11), user(), { ...assistant(), error }])
    expect(out.at(-1)).toEqual({ ...idle, turnID: 'user-2', observedLive: true })
    stop()
  }
})

test('late request bootstrap and host disposal cannot resurrect subscriptions or emit', async () => {
  const h = sessionHost([user()]); const out: Activity[] = []
  let release!: (value: { data: []; request: Request; response: Response }) => void
  const pending = new Promise<{ data: []; request: Request; response: Response }>(resolve => { release = resolve })
  h.api.client.permission.list = (() => pending) as typeof h.api.client.permission.list
  watchActivity(h.api, a => out.push(a)); expect(h.listeners()).toBeGreaterThan(0)
  h.dispose(); release({ data: [], request: new Request('http://fixture.local/permission'), response: new Response('[]') }); await Bun.sleep(0)
  h.set('statuses', 'parent', { type: 'busy' })
  expect(out).toEqual([idle]); expect(h.listeners()).toBe(0)
})
