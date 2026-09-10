import { expect, test, spyOn } from 'bun:test'
import { createMoodController, type Activity } from '../src/state/mood'

const activity = (patch: Partial<Activity> = {}): Activity => ({
  sessionID: 's', turnID: 't', observedLive: true,
  busy: false, waiting: false, retry: false, runningTools: [], outcome: null,
  ...patch,
})

test('10001 turns retain at most 256 retired identities and recent duplicates cannot steal active completion', () => {
  const add = Set.prototype.add
  let peak = 0
  const spy = spyOn(Set.prototype, 'add').mockImplementation(function (this: Set<unknown>, value: unknown) {
    const result = add.call(this, value)
    if (typeof value === 'string' && value.startsWith('history-')) peak = Math.max(peak, this.size)
    return result
  })
  try {
    const c = createMoodController()
    for (let i = 0; i <= 10000; i++) c.update(activity({ turnID: `history-${i}`, busy: true }), i * 1000)
    expect(peak).toBeLessThanOrEqual(256)
    c.update(activity({ turnID: 'history-9999', outcome: 'aborted' }), 10000300)
    expect(c.current(10000300).mood).toBe('thinking')
    expect(c.update(activity({ turnID: 'history-10000', outcome: 'success' }), 10000301).mood).toBe('done')
    c.current(10002000)
    expect(c.update(activity({ turnID: 'history-10000', outcome: 'success' }), 10003000).mood).toBe('idle')
  } finally { spy.mockRestore() }
})

test('history does not celebrate; a live successful turn celebrates once', () => {
  const c = createMoodController()
  const a = activity({ observedLive: false, outcome: 'success' })
  expect(c.update(a, 0).mood).toBe('idle')
  c.update({ ...a, turnID: 'next', observedLive: true, busy: true, outcome: null }, 100)
  expect(c.update({ ...a, turnID: 'next', observedLive: true }, 500)).toEqual({ mood: 'done', since: 500 })
  expect(c.nextDeadline()).toBe(1900)
  expect(c.current(2000)).toEqual({ mood: 'idle', since: 1900 })
  expect(c.update({ ...a, turnID: 'next', observedLive: true }, 2100).mood).toBe('idle')
})

test('routine settling uses the original deadline despite redundant observations', () => {
  const c = createMoodController()
  expect(c.update(activity({ busy: true }), 100)).toEqual({ mood: 'idle', since: 0 })
  expect(c.nextDeadline()).toBe(350)
  c.update(activity({ busy: true }), 200)
  expect(c.current(349).mood).toBe('idle')
  expect(c.current(400)).toEqual({ mood: 'thinking', since: 350 })
  expect(c.update(activity({ busy: true }), 500)).toEqual({ mood: 'thinking', since: 350 })
  expect(c.nextDeadline()).toBeNull()
})

test('concurrent tools stay working until the last tool finishes', () => {
  const c = createMoodController()
  c.update(activity({ busy: true, runningTools: ['a', 'b'] }), 0)
  expect(c.current(250)).toEqual({ mood: 'working', since: 250 })
  expect(c.update(activity({ busy: true, runningTools: ['b'] }), 300)).toEqual({ mood: 'working', since: 250 })
  c.update(activity({ busy: true }), 400)
  expect(c.nextDeadline()).toBe(650)
  expect(c.current(649).mood).toBe('working')
  expect(c.current(650)).toEqual({ mood: 'thinking', since: 650 })
})

test('superseded routine transitions are cancelled rather than flickering', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.current(250)
  c.update(activity({ busy: true, runningTools: ['a'] }), 300)
  c.update(activity({ busy: true }), 400)
  expect(c.nextDeadline()).toBeNull()
  expect(c.current(600)).toEqual({ mood: 'thinking', since: 250 })
  c.update(activity({ busy: true, runningTools: ['b'] }), 700)
  expect(c.update(activity(), 800)).toEqual({ mood: 'idle', since: 800 })
  expect(c.nextDeadline()).toBeNull()
})

test('waiting takes immediate priority over tools, retry and terminal outcomes', () => {
  for (const outcome of ['success', 'error', 'aborted'] as const) {
    const c = createMoodController()
    c.update(activity({ busy: true }), 0)
    expect(c.update(activity({ waiting: true, retry: true, runningTools: ['a'], outcome }), 100)).toEqual({ mood: 'waiting', since: 100 })
    expect(c.nextDeadline()).toBeNull()
    expect(c.update(activity({ waiting: true, outcome }), 200).since).toBe(100)
    expect(c.update(activity({ outcome }), 300).mood).toBe(outcome === 'success' ? 'done' : outcome === 'error' ? 'error' : 'interrupted')
  }
})

test('abort bypasses settling and expires once without a completion hop', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  expect(c.update(activity({ busy: true, outcome: 'aborted' }), 100)).toEqual({ mood: 'interrupted', since: 100 })
  expect(c.nextDeadline()).toBe(750)
  expect(c.update(activity({ outcome: 'aborted' }), 500).since).toBe(100)
  expect(c.current(749).mood).toBe('interrupted')
  expect(c.current(750)).toEqual({ mood: 'idle', since: 750 })
  expect(c.update(activity({ outcome: 'success' }), 800).mood).toBe('idle')
  expect(c.nextDeadline()).toBeNull()
})

test('unknown idle never celebrates but a later confirmed outcome can', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.current(250)
  expect(c.update(activity(), 300)).toEqual({ mood: 'idle', since: 300 })
  expect(c.nextDeadline()).toBeNull()
  expect(c.update(activity({ outcome: 'success' }), 400).mood).toBe('done')
})

test('success waits for busy and all tools to clear', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  expect(c.update(activity({ busy: true, outcome: 'success' }), 300).mood).toBe('thinking')
  c.update(activity({ runningTools: ['a', 'b'], outcome: 'success' }), 400)
  expect(c.current(650).mood).toBe('working')
  expect(c.update(activity({ runningTools: ['b'], outcome: 'success' }), 700).mood).toBe('working')
  expect(c.update(activity({ outcome: 'success' }), 800).mood).toBe('done')
})

test('terminal-first observations cannot retroactively arm a celebration', () => {
  const c = createMoodController()
  expect(c.update(activity({ outcome: 'success' }), 0).mood).toBe('idle')
  c.update(activity({ busy: true }), 100)
  expect(c.update(activity({ outcome: 'success' }), 500).mood).toBe('idle')
  expect(c.nextDeadline()).toBeNull()
})

test('duplicate and reordered observations do not restart completed turns', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.update(activity({ outcome: 'success' }), 100)
  expect(c.update(activity({ busy: true }), 200)).toEqual({ mood: 'done', since: 100 })
  expect(c.update(activity({ outcome: 'success' }), 300).since).toBe(100)
  c.update(activity({ turnID: 'next', busy: true }), 400)
  expect(c.nextDeadline()).toBe(650)
  c.update(activity({ outcome: 'error' }), 500)
  expect(c.current(650)).toEqual({ mood: 'thinking', since: 650 })
  c.update(activity({ busy: true }), 700)
  expect(c.update(activity({ turnID: 'next', outcome: 'success' }), 800)).toEqual({ mood: 'done', since: 800 })
})

test('errors persist through idle and duplicate outcomes until a new live turn', () => {
  const c = createMoodController()
  expect(c.update(activity({ outcome: 'error' }), 100)).toEqual({ mood: 'error', since: 100 })
  expect(c.update(activity(), 200).mood).toBe('error')
  expect(c.update(activity({ outcome: 'error' }), 500).since).toBe(100)
  expect(c.current(10000).mood).toBe('error')
  expect(c.nextDeadline()).toBeNull()
  c.update(activity({ turnID: 'next', busy: true }), 10100)
  expect(c.current(10350).mood).toBe('thinking')
})

test('retry is immediately concerned and live recovery can succeed', () => {
  const c = createMoodController()
  expect(c.update(activity({ busy: true, retry: true }), 0)).toEqual({ mood: 'error', since: 0 })
  expect(c.update(activity({ busy: true, retry: true }), 100).since).toBe(0)
  c.update(activity({ busy: true }), 200)
  expect(c.nextDeadline()).toBe(450)
  expect(c.current(450).mood).toBe('thinking')
  expect(c.update(activity({ outcome: 'success' }), 500).mood).toBe('done')
})

test('same-turn error recovery does not let a stale terminal error relatch', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.update(activity({ outcome: 'error' }), 100)
  c.update(activity({ busy: true }), 200)
  expect(c.current(450).mood).toBe('thinking')
  expect(c.update(activity({ outcome: 'error' }), 500)).toEqual({ mood: 'idle', since: 500 })
  expect(c.current(10000)).toEqual({ mood: 'idle', since: 500 })
  expect(c.nextDeadline()).toBeNull()
})

for (const mood of ['thinking', 'working'] as const) {
  for (const terminalAt of [300, 500]) {
    for (const outcome of ['success', 'error', 'aborted'] as const) {
      test(`${mood} recovery settles on ${outcome} at ${terminalAt} without another observation`, () => {
        const c = createMoodController()
        c.update(activity({ busy: true }), 0)
        c.update(activity({ outcome: 'error' }), 100)
        c.update(activity({ busy: true, runningTools: mood === 'working' ? ['a', 'b'] : [] }), 200)
        expect(c.nextDeadline()).toBe(450)
        if (terminalAt === 500) expect(c.current(450)).toEqual({ mood, since: 450 })
        expect(c.update(activity({ outcome }), terminalAt)).toEqual({ mood: 'idle', since: terminalAt })
        expect(c.nextDeadline()).toBeNull()
        expect(c.current(10000)).toEqual({ mood: 'idle', since: terminalAt })
      })
    }
  }
}

test('deduplicated error still resolves ongoing concurrent tool activity', () => {
  const c = createMoodController()
  c.update(activity({ outcome: 'error' }), 0)
  c.update(activity({ busy: true }), 100)
  c.current(350)
  c.update(activity({ outcome: 'error', runningTools: ['a', 'b'] }), 400)
  expect(c.nextDeadline()).toBe(650)
  expect(c.current(650)).toEqual({ mood: 'working', since: 650 })
  expect(c.update(activity({ outcome: 'error', runningTools: ['b'] }), 700).since).toBe(650)
  expect(c.update(activity({ outcome: 'error' }), 800)).toEqual({ mood: 'idle', since: 800 })
})

for (const flags of [{ busy: true }, { runningTools: ['a', 'b'] }]) {
  test(`duplicate error with stale ${'busy' in flags ? 'busy' : 'tools'} cannot establish recovery`, () => {
    const c = createMoodController()
    const failed = activity({ ...flags, outcome: 'error' })
    expect(c.update(failed, 0)).toEqual({ mood: 'error', since: 0 })
    expect(c.update(failed, 100)).toEqual({ mood: 'error', since: 0 })
    expect(c.nextDeadline()).toBeNull()
    expect(c.current(350)).toEqual({ mood: 'error', since: 0 })
    // A contradictory terminal outcome with stale activity is not recovery either.
    expect(c.update({ ...failed, outcome: 'success' }, 400).mood).toBe('error')
    expect(c.nextDeadline()).toBeNull()
    c.update({ ...failed, outcome: null, observedLive: false }, 500)
    expect(c.current(750).mood).toBe('error')
    c.update({ ...failed, outcome: null }, 800)
    expect(c.nextDeadline()).toBe(1050)
    expect(c.current(1050).mood).toBe('busy' in flags ? 'thinking' : 'working')
    expect(c.update(activity({ outcome: 'success' }), 1100)).toEqual({ mood: 'idle', since: 1100 })
    expect(c.nextDeadline()).toBeNull()
  })
}

for (const knownTurn of [false, true]) {
  test(`null-ID abort duplicates expire once ${knownTurn ? 'with' : 'without'} a retained known turn`, () => {
    const c = createMoodController()
    if (knownTurn) c.update(activity({ busy: true }), 0)
    const aborted = activity({ turnID: null, outcome: 'aborted' })
    expect(c.update(aborted, 0)).toEqual({ mood: 'interrupted', since: 0 })
    expect(c.nextDeadline()).toBe(650)
    expect(c.update(aborted, 500)).toEqual({ mood: 'interrupted', since: 0 })
    expect(c.nextDeadline()).toBe(650)
    expect(c.current(650)).toEqual({ mood: 'idle', since: 650 })
    expect(c.update(aborted, 1000)).toEqual({ mood: 'idle', since: 650 })
    expect(c.nextDeadline()).toBeNull()
    if (knownTurn) {
      // The unidentified effect must not consume the retained concrete identity.
      expect(c.update(activity({ outcome: 'success' }), 1100).mood).toBe('done')
    }
  })
}

for (const mood of ['thinking', 'working'] as const) {
  for (const terminalAt of [300, 500]) {
    test(`duplicate null-ID abort settles resumed ${mood} at ${terminalAt}`, () => {
      const c = createMoodController()
      c.update(activity({ busy: true }), 0)
      const aborted = activity({ turnID: null, outcome: 'aborted' })
      expect(c.update(aborted, 100)).toEqual({ mood: 'interrupted', since: 100 })
      expect(c.nextDeadline()).toBe(750)
      c.update(activity({ busy: true, runningTools: mood === 'working' ? ['a', 'b'] : [] }), 200)
      expect(c.nextDeadline()).toBe(450)
      if (terminalAt === 500) expect(c.current(450)).toEqual({ mood, since: 450 })
      expect(c.update(aborted, terminalAt)).toEqual({ mood: 'idle', since: terminalAt })
      expect(c.nextDeadline()).toBeNull()
      expect(c.current(10000)).toEqual({ mood: 'idle', since: terminalAt })
      expect(c.update(aborted, 10100)).toEqual({ mood: 'idle', since: terminalAt })
      // Deduplicating the effect still must not consume the retained known turn.
      expect(c.update(activity({ outcome: 'success' }), 10200).mood).toBe('done')
    })
  }
}

test('waiting after an unidentified abort clears without replaying interruption', () => {
  const c = createMoodController()
  const aborted = activity({ turnID: null, outcome: 'aborted' })
  c.update(aborted, 0)
  expect(c.update({ ...aborted, waiting: true }, 100).mood).toBe('waiting')
  expect(c.update(aborted, 200)).toEqual({ mood: 'idle', since: 200 })
  expect(c.nextDeadline()).toBeNull()
})

test('unidentified interruption deduplication is scoped to the current turn context', () => {
  const c = createMoodController()
  const aborted = activity({ turnID: null, outcome: 'aborted' })
  c.update(aborted, 0)
  c.current(650)
  c.update(activity({ turnID: 'next', busy: true }), 700)
  expect(c.update(aborted, 800)).toEqual({ mood: 'interrupted', since: 800 })
  expect(c.nextDeadline()).toBe(1450)
  c.reset()
  expect(c.update(aborted, 1500)).toEqual({ mood: 'interrupted', since: 1500 })
  expect(c.nextDeadline()).toBe(2150)
  expect(c.update({ ...aborted, sessionID: 'other' }, 1600)).toEqual({ mood: 'interrupted', since: 1600 })
  expect(c.nextDeadline()).toBe(2250)
})

test('session switch clears completion and pending changes and baselines history', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.update(activity({ outcome: 'success' }), 100)
  expect(c.update(activity({ sessionID: 'other', observedLive: false, outcome: 'success' }), 200)).toEqual({ mood: 'idle', since: 200 })
  expect(c.nextDeadline()).toBeNull()
  c.update(activity({ sessionID: 'other', turnID: 'new', busy: true }), 300)
  c.update(activity({ observedLive: false, outcome: 'success' }), 400)
  // The pending thinking mood never became visible, so idle keeps its age.
  expect(c.current(2000)).toEqual({ mood: 'idle', since: 200 })
  expect(c.nextDeadline()).toBeNull()
})

test('attach and reset/re-enable never celebrate a merely loaded busy turn', () => {
  const c = createMoodController()
  for (const start of [0, 2000]) {
    c.update(activity({ observedLive: false, busy: true }), start)
    expect(c.current(start + 250).mood).toBe('thinking')
    expect(c.update(activity({ outcome: 'success' }), start + 300).mood).toBe('idle')
    c.reset()
    expect(c.nextDeadline()).toBeNull()
    expect(c.current(start + 500)).toEqual({ mood: 'idle', since: 0 })
  }
})

test('a baseline busy turn qualifies only after a live busy observation', () => {
  const c = createMoodController()
  c.update(activity({ observedLive: false, busy: true }), 0)
  c.update(activity({ busy: true }), 100)
  expect(c.update(activity({ outcome: 'success' }), 200).mood).toBe('done')
})

test('null turn identities cannot celebrate', () => {
  const c = createMoodController()
  c.update(activity({ turnID: null, busy: true }), 0)
  expect(c.update(activity({ turnID: null, outcome: 'success' }), 300).mood).toBe('idle')
})

test('known null known preserves concern and accepts the current request', () => {
  const c = createMoodController()
  c.update(activity({ outcome: 'error' }), 0)
  expect(c.update(activity({ turnID: null }), 100)).toEqual({ mood: 'error', since: 0 })
  expect(c.update(activity({ waiting: true }), 200)).toEqual({ mood: 'waiting', since: 200 })
  expect(c.nextDeadline()).toBeNull()
  expect(c.update(activity(), 300).mood).toBe('error')
})

test('known null known preserves eligibility for delayed identified success', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.current(250)
  expect(c.update(activity({ turnID: null }), 300)).toEqual({ mood: 'idle', since: 300 })
  expect(c.update(activity({ outcome: 'success' }), 400)).toEqual({ mood: 'done', since: 400 })
  expect(c.nextDeadline()).toBe(1800)
  c.update(activity({ turnID: null }), 500)
  expect(c.update(activity({ outcome: 'success' }), 600)).toEqual({ mood: 'done', since: 400 })
})

test('unidentified busy cannot arm the previous or a successor turn', () => {
  for (const turnID of ['t', 'next']) {
    const c = createMoodController()
    c.update(activity(), 0)
    c.update(activity({ turnID: null, busy: true }), 100)
    expect(c.update(activity({ turnID, outcome: 'success' }), 400).mood).toBe('idle')
    expect(c.nextDeadline()).toBeNull()
  }
})

test('unidentified success neither celebrates nor consumes the known turn', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  expect(c.update(activity({ turnID: null, outcome: 'success' }), 100).mood).toBe('idle')
  expect(c.update(activity({ outcome: 'success' }), 200).mood).toBe('done')
})

test('tool-only activity does not substitute for an observed busy turn', () => {
  const c = createMoodController()
  c.update(activity({ runningTools: ['a'] }), 0)
  expect(c.current(250).mood).toBe('working')
  expect(c.update(activity({ outcome: 'success' }), 300).mood).toBe('idle')
})

test('a request after a consumed completion clears without replaying completion', () => {
  const c = createMoodController()
  c.update(activity({ busy: true }), 0)
  c.update(activity({ outcome: 'success' }), 100)
  expect(c.update(activity({ waiting: true, outcome: 'success' }), 200).mood).toBe('waiting')
  expect(c.update(activity({ outcome: 'success' }), 300)).toEqual({ mood: 'idle', since: 300 })
  expect(c.nextDeadline()).toBeNull()
})

test('clearing a request restores persistent terminal concern', () => {
  const c = createMoodController()
  c.update(activity({ outcome: 'error' }), 0)
  c.update(activity({ waiting: true, outcome: 'error' }), 100)
  expect(c.update(activity({ outcome: 'error' }), 200)).toEqual({ mood: 'error', since: 200 })
})

test('callers cannot mutate controller state through returned snapshots', () => {
  const c = createMoodController()
  const snapshot = c.update(activity({ waiting: true }), 100)
  snapshot.mood = 'done'
  snapshot.since = -1
  expect(c.current(200)).toEqual({ mood: 'waiting', since: 100 })
})
