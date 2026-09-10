import { catalog } from '../src/art/catalog'
import { compose } from '../src/art/compose'
import { perchFrame, perchGeometry } from '../src/tui/placement'
import type { Appearance, Frame, Mood } from '../src/art/types'

declare global { interface Window { toggleSelect(element: HTMLElement): void } }
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const character = catalog.characters[0]
let appearance: Appearance = { character: character.id, ...character.defaults }
let mood: Mood = 'working'
let paused = false
let elapsed = 0
let since = performance.now()
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const captions: Record<Mood, string> = {
  idle: 'A steady, rounded silhouette with an occasional blink.',
  thinking: 'A slow sideways glance and a tiny line mouth. Body and hat stay still.',
  working: 'Focused eyebrows and a slow, one-pixel whole-body bob.',
  waiting: 'Wide-eyed and mostly still, waiting for you.',
  done: 'One happy hop, then back to curious idle.',
  error: 'A brief startle, then a concerned little face.',
  interrupted: 'Settles gently and returns to idle.',
}
function buttons(container: HTMLElement, values: { id: string; name: string }[], selected: string, choose: (id: string) => void, kind?: string) {
  container.replaceChildren()
  for (const value of values) {
    const button = document.createElement('button')
    button.textContent = value.name
    button.setAttribute('aria-pressed', String(value.id === selected))
    if (kind) { button.className = 'option'; button.dataset.choice = `${kind}:${value.id}` }
    button.onclick = () => {
      if (kind) window.toggleSelect(button)
      container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
      choose(value.id)
      render()
    }
    container.append(button)
  }
}
function pickers() {
  const root = el('pickers'); root.replaceChildren()
  const current = catalog.characters.find(c => c.id === appearance.character)!
  const groups = [
    { kind: 'character', name: 'Character', values: catalog.characters },
    { kind: 'skin', name: 'Skin', values: current.skins },
    { kind: 'hat', name: 'Hat comparison', values: catalog.hats.filter(h => h.id === 'none' || current.hats.includes(h.id)) },
  ] as const
  for (const group of groups) {
    const label = document.createElement('div'); label.textContent = group.name
    const options = document.createElement('div'); options.className = 'options'; options.setAttribute('aria-label', group.name)
    buttons(options, group.values, appearance[group.kind], id => {
      appearance[group.kind] = id
      if (group.kind === 'character') {
        const next = catalog.characters.find(c => c.id === id)!
        appearance = { character: id, ...next.defaults }
        // Keep clicked option attached until the companion's document click listener records it.
        queueMicrotask(pickers)
      }
    }, group.kind)
    root.append(label, options)
  }
}
buttons(el('moods'), Object.keys(captions).map(id => ({ id, name: id === 'done' ? 'Finished' : id[0].toUpperCase() + id.slice(1) })), mood, id => {
  mood = id as Mood; elapsed = 0; since = performance.now(); el('caption').textContent = captions[mood]
})
buttons(el('layouts'), [
  { id: 'first', name: 'Before first prompt' }, { id: 'sidebar', name: 'Sidebar open' },
  { id: 'narrow', name: 'Sidebar hidden' }, { id: 'waiting', name: 'Waiting panel' },
], 'first', setLayout)
function setLayout(id: string) {
  el('terminal').hidden = id === 'waiting'; el('waiting-panel').hidden = id !== 'waiting'
  el('sidebar').hidden = id !== 'sidebar'; el('input-pet').style.visibility = id === 'sidebar' ? 'hidden' : 'visible'
  el('layout-label').textContent = id === 'first' ? 'New conversation' : `Conversation · sidebar ${id === 'sidebar' ? 'visible' : 'hidden'}`
  el('chat-copy').textContent = id === 'first' ? 'What shall we build today? Your jelly is ready when you are.' : '› Let’s build something lovely. The conversation continues here…'
}
const cache = new WeakMap<HTMLCanvasElement, string>()
function draw(canvas: HTMLCanvasElement, frame: Frame) {
  const signature = JSON.stringify(frame.pixels)
  if (cache.get(canvas) === signature) return
  cache.set(canvas, signature)
  canvas.width = frame.width; canvas.height = frame.height
  // Warp-style 8 × 16 cells: each source pixel is one square half-cell.
  const scale = canvas.id === 'hero' ? 16 : 8
  canvas.style.width = `${frame.width * scale}px`; canvas.style.height = `${frame.height * scale}px`
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, frame.width, frame.height)
  frame.pixels.forEach((color, i) => {
    if (color === null) return
    const x = i % frame.width, y = Math.floor(i / frame.width)
    ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1)
  })
}
function render() {
  const frame = compose(catalog, appearance, mood, elapsed, !reduced.matches)
  const geometry = perchGeometry(catalog.characters.find(c => c.id === appearance.character)!.bounds)
  const selected = perchFrame(frame, geometry)
  el('input-pet').style.height = `${geometry.height * 8}px`
  document.querySelector<HTMLElement>('.sidebar-perch')!.style.height = `${geometry.height * 8 + 16}px`
  document.querySelectorAll<HTMLCanvasElement>('canvas').forEach(canvas => {
    draw(canvas, selected)
  })
  el<HTMLInputElement>('time').value = String(Math.min(elapsed, 10000))
  el('elapsed').textContent = `${Math.floor(elapsed / 100) * 100} ms`
  el('motion').textContent = reduced.matches ? 'Reduced motion · static poses' : '10 fps maximum'
}
function setPaused(value: boolean) {
  paused = value; since = performance.now()
  el('pause').textContent = paused ? 'Resume' : 'Pause'
  el('pause').setAttribute('aria-pressed', String(paused))
}
el('pause').onclick = () => setPaused(!paused)
el('replay').onclick = () => { elapsed = 0; setPaused(false); render() }
el<HTMLInputElement>('time').oninput = event => { setPaused(true); elapsed = Number((event.target as HTMLInputElement).value); render() }
reduced.addEventListener('change', () => { since = performance.now(); render() })
pickers(); setLayout('first'); el('caption').textContent = captions[mood]; render()
setInterval(() => {
  const now = performance.now()
  if (!paused && !reduced.matches) { elapsed += now - since; render() }
  since = now
}, 100)
