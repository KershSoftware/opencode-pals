export type FrameClock = { setActive(active: boolean): void; dispose(): void }

export function createFrameClock(tick: (now: number) => void): FrameClock {
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  function setActive(active: boolean) {
    if (disposed) return
    if (active && timer === undefined) timer = setInterval(() => tick(performance.now()), 100)
    if (!active && timer !== undefined) { clearInterval(timer); timer = undefined }
  }
  return { setActive, dispose() { setActive(false); disposed = true } }
}
