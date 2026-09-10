import type { Mood } from '../art/types'

export type Activity = {
  sessionID: string
  turnID: string | null
  observedLive: boolean
  busy: boolean
  waiting: boolean
  retry: boolean
  runningTools: string[]
  outcome: 'success' | 'error' | 'aborted' | null
}

export type MoodSnapshot = { mood: Mood; since: number }
export type MoodController = {
  update(activity: Activity, now: number): MoodSnapshot
  current(now: number): MoodSnapshot
  nextDeadline(): number | null
  reset(): void
}

type Turn = {
  id: string | null
  liveBusy: boolean
  consumed: Activity['outcome']
  unidentifiedAbort: boolean
}

/** Explicit timestamps must use the same monotonic clock. No host or timer ownership. */
export function createMoodController(): MoodController {
  let snapshot: MoodSnapshot = { mood: 'idle', since: 0 }
  let sessionID: string | undefined
  let turn: Turn | undefined
  // Opaque IDs: retain 256 recently superseded turns, separate from the active
  // turn's non-evictable terminal latch. The host adapter's ordering watermark
  // rejects older history windows before they reach this controller.
  const retired = new Set<string>()
  let pending: { mood: 'thinking' | 'working'; at: number } | null = null
  let expires: number | null = null
  let concerned = false

  function show(mood: Mood, at: number) {
    if (snapshot.mood !== mood) snapshot = { mood, since: at }
  }

  function current(now: number): MoodSnapshot {
    if (pending && now >= pending.at) {
      show(pending.mood, pending.at)
      pending = null
    }
    if (expires !== null && now >= expires) {
      show('idle', expires)
      expires = null
    }
    return { ...snapshot }
  }

  function immediate(mood: Mood, now: number, duration?: number) {
    pending = null
    expires = duration === undefined ? null : now + duration
    show(mood, now)
  }

  function routine(mood: 'thinking' | 'working', now: number) {
    expires = null
    if (snapshot.mood === mood) pending = null
    else if (pending?.mood !== mood) pending = { mood, at: now + 250 }
  }

  function reset() {
    snapshot = { mood: 'idle', since: 0 }
    sessionID = undefined
    turn = undefined
    retired.clear()
    pending = null
    expires = null
    concerned = false
  }

  function update(a: Activity, now: number): MoodSnapshot {
    current(now)
    if (sessionID !== a.sessionID) {
      if (sessionID !== undefined) immediate('idle', now)
      sessionID = a.sessionID
      turn = undefined
      retired.clear()
      concerned = false
    }

    // Missing identity is not evidence of a successor. Keep the known turn's
    // eligibility and terminal bookkeeping until a concrete replacement arrives.
    if (!turn || (a.turnID !== null && turn.id !== a.turnID)) {
      if (a.turnID !== null && retired.has(a.turnID)) return current(now)
      if (turn?.id !== null && turn?.id !== undefined) {
        if (retired.size === 256) retired.delete(retired.values().next().value!)
        retired.add(turn.id)
      }
      turn = { id: a.turnID, liveBusy: false, consumed: null, unidentifiedAbort: false }
      pending = null
      expires = null
      if (a.observedLive) concerned = false
      if (!concerned) show('idle', now)
    }

    if (a.turnID !== null && a.observedLive && a.busy && turn.consumed === null) turn.liveBusy = true

    // Requests are visible even when terminal/status notifications arrive first.
    // Defer terminal consumption until the request has cleared.
    if (a.waiting) {
      immediate('waiting', now)
      return current(now)
    }

    if (turn.consumed !== null) {
      // Waiting may have replaced an already-consumed terminal mood. Clearing
      // that request restores concern/idle, never a fresh terminal animation.
      if (snapshot.mood === 'waiting') immediate(concerned ? 'error' : 'idle', now)
      // Only an explicit live recovery can leave terminal concern. Successful
      // and aborted turns cannot be resurrected by reordered busy snapshots.
      if (turn.consumed !== 'error') return current(now)
    }

    // Deduplicate terminal effects, not the current activity flags. A recovered
    // errored turn must still settle when busy/tools clear, even if its final
    // snapshot repeats or contradicts the already-consumed terminal outcome.
    const outcome = turn.consumed === null ? a.outcome : null
    if (outcome === 'aborted') {
      if (a.turnID !== null) turn.consumed = 'aborted'
      else {
        // Deduplicate the unidentified effect without consuming the retained
        // concrete turn. This latch lasts until a successor/session/reset.
        if (turn.unidentifiedAbort) {
          // Only an interruption with its original expiry may remain visible.
          // Resumption cancels that expiry; a terminal duplicate must then
          // cancel pending/visible activity rather than merely suppress replay.
          if (snapshot.mood !== 'interrupted' || expires === null) {
            immediate(concerned ? 'error' : 'idle', now)
          }
          return current(now)
        }
        turn.unidentifiedAbort = true
      }
      concerned = false
      immediate('interrupted', now, 650)
    } else if (outcome === 'error' || a.retry) {
      if (a.turnID !== null && outcome === 'error') turn.consumed = 'error'
      concerned = true
      immediate('error', now)
    } else if (a.runningTools.length > 0 || a.busy) {
      // Busy/tool flags accompanying a terminal outcome may be stale. Only a
      // live nonterminal observation establishes recovery from concern.
      if (a.observedLive && a.outcome === null) concerned = false
      if (concerned) immediate('error', now)
      else routine(a.runningTools.length > 0 ? 'working' : 'thinking', now)
    } else if (outcome === 'success') {
      if (a.turnID !== null) turn.consumed = 'success'
      if (a.turnID !== null && turn.liveBusy && a.observedLive) {
        concerned = false
        immediate('done', now, 1400)
      } else immediate(concerned ? 'error' : 'idle', now)
    } else immediate(concerned ? 'error' : 'idle', now)

    return current(now)
  }

  return {
    update,
    current,
    nextDeadline: () => {
      if (pending === null) return expires
      return expires === null ? pending.at : Math.min(pending.at, expires)
    },
    reset,
  }
}
