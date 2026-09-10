# OpenCode Pals — historical Jelly implementation plan

> Historical implementation record. The final amendment in
> `../specs/2026-09-10-blue-jelly-design.md` supersedes names, dimensions and gates
> below: package/plugin `opencode-pals`, `/pals`, Pals palette, namespaced migrated
> preferences, and the accepted 14-column production candidate. Follow the root
> README for current setup; do not replay these completed implementation steps.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user chooses delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved reactive jelly as an extensible OpenCode TUI plugin, with separate hats/skins, persistent `/pet` controls, and an exactly reproducible Superpowers live-demo workflow.

**Architecture:** A pure pixel-frame composer and mood timeline are shared by a browser demo and a native half-block terminal view. A small catalog supplies characters, skins, and accessories; a TUI adapter handles real session activity, placement, settings, and lifecycle. Validate native slot composition early, before spending time on full reactive integration.

**Tech Stack:** Bun, TypeScript, Solid, OpenTUI, `@opencode-ai/plugin/tui`, Bun tests, browser verification, and the installed Superpowers visual companion.

**Spec:** `docs/superpowers/specs/2026-09-10-blue-jelly-design.md` — read the complete approved spec before executing.

## Global Constraints

- Target OpenCode `1.18.30`; locally verified binary is `~/.opencode/bin/opencode`.
- Local Bun is `1.3.13`; do not upgrade the user's global runtime without asking.
- Matching upstream dependencies: `@opentui/core`, `@opentui/solid`, and `@opentui/keymap` `0.4.5`; `solid-js` `1.9.10`; TypeScript `5.8.2`.
- Upstream patches Solid: do not bundle a second Solid/OpenTUI runtime into the plugin.
- Initial content is `jelly`, `sky-blue`, and hats `none` / `lavender-bucket`.
- Default appearance is the approved sky-blue jelly with the lavender bucket hat.
- Preserve the approved 24 × 24 coordinate system and colors.
- No inward head squish or changing head silhouette.
- One visible blue pixel row between the brim and working eyebrows.
- Thinking uses the tiny line mouth, never the rejected “o” mouth.
- Only one pet is visible per OpenCode terminal instance.
- Shared animation clock: at most 10 updates per second; avoid unchanged-frame redraws.
- Show/hide and appearance settings apply immediately and persist via host KV.
- `/pet` remains available when the pet is hidden.
- `bun run demo -- --open` uses the actual installed Superpowers companion.
- No machine-specific cache paths in project scripts.
- Initial loading validation is project-local; restart OpenCode after config-time installation changes.
- This folder currently contains design artifacts and no Git repository. Preserve existing files; do not commit, initialize Git, or push unless requested.
- Do not dispatch subagents unless the user chooses that execution approach.

## File map

```text
package.json, bun.lock, tsconfig.json, .gitignore
src/art/types.ts                 pixel, pose, character, skin, hat contracts
src/art/raster.ts                integer pixel drawing and compositing
src/art/jelly.ts                 bare jelly geometry and face drawing
src/art/bucket-hat.ts            independent lavender bucket layer
src/art/catalog.ts               local definitions and ID validation
src/art/compose.ts               skin + character + compatible accessory
src/art/timeline.ts              deterministic mood pose at elapsed time
src/state/mood.ts                normalized activity → mood transitions
src/state/preferences.ts         saved appearance validation and changes
src/tui/encode.ts                frame → foreground/background half blocks
src/tui/pet-view.tsx             frame presentation and shared clock
src/tui/placement.ts             pure perch selection and anchor ownership
src/tui/anchors.tsx              host slot wrappers and geometry adapters
src/tui/session.ts               public host state/events → normalized activity
src/tui/menu.tsx                 /pet and command-palette settings
src/tui/index.tsx                plugin registration and disposal
demo/template.html              layout study and controls
demo/browser.ts                 canvas view using shared frame composer
scripts/demo.ts                 companion launch/watch/revision entry
scripts/companion.ts            portable discovery and server protocol adapter
scripts/build.ts                native plugin build, host dependencies external
tests/art.test.ts
tests/encode.test.ts
tests/demo.test.ts
tests/mood.test.ts
tests/preferences.test.ts
tests/placement.test.ts
tests/session.test.ts
tests/lifecycle.test.ts
tests/fixtures/approved-jelly.json
tests/fixtures/catalog.ts        temporary second creature/skin for extensibility tests
docs/character-workflow.md
docs/integration-evidence.md
README.md
```

## Task 1: Shared artwork with independently selectable bucket hat

**Files:** create package/config files, `src/art/*`, `tests/art.test.ts`, and `tests/fixtures/approved-jelly.json`.

**Consumes:** approved drawing in `.superpowers/brainstorm/89862-1789010902/content/blue-jelly-brim-v9.html`.

**Produces:** the following contracts in `src/art/types.ts`; all downstream tasks use these exact names.

```ts
export type Mood = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'interrupted'
export type Pixel = string | null // opaque #rrggbb or transparent
export type Frame = { width: number; height: number; pixels: Pixel[] }
export type Appearance = { character: string; skin: string; hat: string }
export type Pose = { dy: number; eyeDx: number; blink: boolean; mood: Mood }
export type Skin = { id: string; name: string; palette: Record<string, string> }
export type Hat = {
  id: string; name: string
  draw(pose: Pose, anchor: { x: number; y: number }): Frame
}
export type Character = {
  id: string; name: string; skins: Skin[]; hats: string[]
  defaults: { skin: string; hat: string }
  anchor: { x: number; y: number }
  bounds: { x: number; y: number; width: number; height: number }
  draw(pose: Pose, skin: Skin): Frame
}
export type Catalog = { characters: Character[]; hats: Hat[] }
```

Export `poseAt(mood: Mood, elapsedMs: number, animate: boolean): Pose` from
`timeline.ts`, `catalog: Catalog` from `catalog.ts`, and
`compose(catalog: Catalog, appearance: Appearance, mood: Mood, elapsedMs: number,
animate: boolean): Frame` from `compose.ts`.

- [ ] Create `package.json` with name `opencode-jelly-pet`, `private: true`, `type: module`, and scripts `test: bun test`, `typecheck: tsc --noEmit`, `demo: bun scripts/demo.ts`, `build: bun scripts/build.ts`. Add exact development versions above, `@opencode-ai/plugin@1.18.30`, `@opencode-ai/sdk@1.18.30`, and `@types/bun@1.3.13`; run `bun install` after verifying the project directory. Keep host UI dependencies external at build time.
- [ ] Set TypeScript `strict`, `noEmit`, `target: ESNext`, `module: ESNext`, `moduleResolution: Bundler`, `jsx: preserve`, `jsxImportSource: @opentui/solid`, `types: [bun]`, and `skipLibCheck: true`. Ignore `node_modules/`, `dist/`, `.superpowers/`, `.playwright-mcp/`, and local smoke-test configs.
- [ ] Before refactoring, use the existing browser's `draw` function at deterministic times to capture approved pixel arrays into the fixture. Set its `since` variable to zero and call `draw(canvas, ms)` in one synchronous evaluation so both idle and elapsed-time animations share a reproducible origin. Include bare and hatted forms for each mood, thinking at 500/1800/3200/3700 ms, and working at 0/1256 ms. Set reduced motion explicitly off; preserve the fixture with a note identifying v9 as the source. Type the loaded fixture records using `Appearance`, `Mood`, `Frame`, and `ms: number`. Do not generate expected pixels from the new implementation.
- [ ] Write failing parity and separation tests. Representative test body:

```ts
import { expect, test } from 'bun:test'
import { compose } from '../src/art/compose'
import { catalog } from '../src/art/catalog'
import approved from './fixtures/approved-jelly.json'
test('matches the approved pixels', () => {
  for (const item of approved) {
    expect(compose(catalog, item.appearance, item.mood, item.ms, true))
      .toEqual(item.frame)
  }
})
test('working brim remains separated from eyebrows', () => {
  const frame = compose(catalog,
    { character: 'jelly', skin: 'sky-blue', hat: 'lavender-bucket' },
    'working', 0, true)
  const pixel = (x: number, y: number) => frame.pixels[y * frame.width + x]
  for (let x = 4; x < 20; x++) expect(pixel(x, 14)).toBe('#655887')
  for (const x of [6, 7, 8, 15, 16, 17])
    expect(['#64b9ed', '#338bc4']).toContain(pixel(x, 15))
  expect(pixel(7, 16)).toBe('#193f62')
})
```

- [ ] Run `bun test tests/art.test.ts`; expect missing-module failure before implementing.
- [ ] Extract the approved drawing into integer pixel functions, preserving its order, colors, and positions. Replace canvas calls with `put(frame, x, y, width, height, color)` in `raster.ts`; clip to bounds and initialize pixels to `null`. Translate palette literals to skin keys with identical default colors. Move the hat drawing into its own layer. Define the jelly anchor and hat-local coordinates so composition reproduces v9 exactly.
- [ ] Implement `poseAt` with the spec's timing, including static expressions for `animate=false`. The compositor draws the base first, the accessory second, using the same pose. Preserve 24 × 24 output; store crop/alignment bounds separately so fixtures remain comparable.
- [ ] Run `bun test tests/art.test.ts` and `bun run typecheck`. Add checks for transparent margins, complete bare head, stationary thinking silhouette, consistent hat/body translation, and static motion-disabled frames. Review the parity failures pixel-by-pixel rather than updating the approved fixture to match accidental changes.

**Deliverable:** the accepted jelly and independent hat are reproducible without a browser or terminal dependency.

## Task 2: Repeatable Superpowers demo from shared frames

**Files:** create `scripts/companion.ts`, `scripts/demo.ts`, `demo/template.html`, `demo/browser.ts`, `tests/demo.test.ts`, and `docs/character-workflow.md`.

**Consumes:** `catalog`, `compose`, `Mood`, `Appearance`, and `Frame` from Task 1.

**Produces:** `parseServerInfo(stdout: string): ServerInfo`,
`findCompanion(explicit?: string): Promise<string>`, and
`publishScreen(info: ServerInfo, html: string): Promise<string>` in `companion.ts`.

```ts
export type ServerInfo = {
  url: string; screen_dir: string; state_dir: string
}
```

- [ ] Write failing parser tests using the actual companion JSON shape:

```ts
test('retains the authenticated URL and returned directories', () => {
  const info = parseServerInfo(JSON.stringify({
    type: 'server-started', url: 'http://localhost:1234/?key=example',
    screen_dir: '/tmp/pet/content', state_dir: '/tmp/pet/state'
  }))
  expect(info.url).toBe('http://localhost:1234/?key=example')
  expect(() => parseServerInfo('{"type":"server-started"}')).toThrow()
})
```

- [ ] Run `bun test tests/demo.test.ts` and confirm failure before implementation.
- [ ] Read the installed companion guide and launcher. Resolve the explicit flag, then `SUPERPOWERS_DIR`, then documented installed skill locations. Accept the Superpowers package root or brainstorming skill directory by checking for the actual launcher. Fail with the exact missing prerequisite and override syntax when neither resolves.
- [ ] Invoke `bash` with an argument array: `[launcher, '--project-dir', projectRoot, ...openFlag]`. Parse the `server-started` JSON line without stripping the URL query. Validate that `server-info` exists and `server-stopped` does not before publishing; restart through the launcher if needed. Do not copy or vendor the companion source.
- [ ] Bundle `demo/browser.ts` for the browser using `Bun.build` and inline it into a fresh full HTML document based on `demo/template.html`. Inline the shared catalog/composer dependencies so each revision is self-contained. Escape closing script tags in embedded source. Render non-null pixels with `fillRect(x, y, 1, 1)` and disable smoothing.
- [ ] Reproduce v9's enlarged sprite, smaller placement views, mood controls, and hat comparison. Populate character/skin/hat choices from `catalog`. Add a pause/time slider and waiting-panel view. Call the companion helper `toggleSelect` for catalog options so selections appear in `state_dir/events`. Keep preferences in the demo independent of real OpenCode settings.
- [ ] Watch `src/art/` and `demo/`, debounce writes, and produce a unique timestamp-plus-counter HTML name per revision. Preserve old documents. Print the full URL and state path for the coding agent. Document `--stop` and `--events` modes on the same `demo` command; implement them by using the returned state/session directory and the companion's stop script/events file. Preserve session metadata in ignored project files.
- [ ] Run `bun test tests/demo.test.ts` with a fake launcher fixture covering missing prerequisites, paths with spaces, valid startup JSON, stopped server, and unique revision filenames. Run `bun run demo -- --open` against the real installed companion. Use browser tooling to check each picker, mood, layout, replay, time control, and reduced motion.
- [ ] Edit one harmless preview label, confirm a fresh screen appears automatically, then revert the edit. Make a selection and verify its recorded event. Write the exact successful commands and edit → preview → feedback loop into `docs/character-workflow.md`.

**Deliverable:** the workflow used during brainstorming is reproducible from project sources and shared art.

## Task 3: Native renderer and static plugin feasibility gate

**Files:** create `src/tui/encode.ts`, `src/tui/pet-view.tsx`, `src/tui/index.tsx`, `scripts/build.ts`, `tests/encode.test.ts`, and `docs/integration-evidence.md`.

**Consumes:** Task 1's `Frame`, `compose`, and `catalog`.

**Produces:** `encodeFrame(frame: Frame, background: (x: number, y: number) => string): Cell[][]`.

```ts
export type Cell = { char: '▀'; fg: string; bg: string }
// Top pixel becomes foreground; bottom pixel becomes background.
// Transparent halves resolve through the supplied per-pixel background function.
```

- [ ] Write and run a failing transparent-half test:

```ts
test('encodes transparent halves against their own background', () => {
  const cells = encodeFrame({ width: 2, height: 2,
    pixels: ['#64b9ed', null, null, '#655887'] }, () => '#141618')
  expect(cells).toEqual([[
    { char: '▀', fg: '#64b9ed', bg: '#141618' },
    { char: '▀', fg: '#141618', bg: '#655887' },
  ]])
})
```

- [ ] Implement row-pair encoding, including odd heights and transparent top/bottom halves. The native view renders fixed-height rows with styled spans, no wrapping, and no direct terminal writes. Start with static working and thinking frames to inspect brim spacing.
- [ ] Inspect the installed `@opencode-ai/plugin/tui` and `@opentui/solid` exports and the version-matched OpenCode TUI plugin loader/config schema. Record the exact supported external-module export and loading form. Fetch `https://opencode.ai/config.json` or the separate TUI schema used by that loader before writing any configuration. Do not infer a server-plugin entry from the generic plugin documentation.
- [ ] Build the TSX entry with OpenTUI's supported Solid transform. Use the installed transform's actual export after reading its declarations; externalize `solid-js`, `solid-js/*`, `@opentui/*`, and `@opencode-ai/*`. The entry must use `TuiPlugin` and export the module shape the loader accepts. Typecheck against 1.18.30, not latest APIs.
- [ ] Load the static sprite through a temporary project-local TUI config. Restart a separate OpenCode smoke-test instance in this project. Record the exact build/load command, schema, module export, runtime versions, and observed terminal dimensions in `docs/integration-evidence.md`.
- [ ] Inspect `SolidPlugin`/slot registry types and test whether `sidebar_footer` can decorate the built-in single-winner renderer. Verify the real return/middleware API with a minimal wrapper that shows one extra static row while preserving the original path/version. If wrapping is unavailable, implement the spec's narrow public path/version footer adapter and document how it detects a competing custom footer. Stop for user input if neither approach can coexist safely.
- [ ] Check half-block size in the user's terminal at a normal font size. Verify body/hat proportions, color, whole-frame bounds, and no garbage ANSI output. Run `bun test tests/encode.test.ts`, `bun run typecheck`, and `bun run build`.

**Gate:** do not continue to full placement until the actual plugin loads and the static sprite/slot composition works. A browser-only result is not sufficient evidence.

## Task 4: Single-pet placement and stable input composition

**Files:** create `src/tui/placement.ts`, `src/tui/anchors.tsx`, `tests/placement.test.ts`; modify `src/tui/index.tsx` and `docs/integration-evidence.md`.

**Consumes:** static view and verified slot mechanism from Task 3.

**Produces:** pure `choosePerch(input: PerchInput): Perch` and mounted anchor adapters.

```ts
export type Perch = 'none' | 'home' | 'prompt' | 'sidebar' | 'waiting'
export type PerchInput = {
  enabled: boolean; fits: boolean; dialogOpen: boolean
  route: 'home' | 'session' | 'other'
  sidebarVisible: boolean; promptVisible: boolean; waiting: boolean
}
```

- [ ] Write failing tests for sidebar priority, hidden input waiting fallback, unknown route, disabled, tiny viewport, and dialog precedence. Example:

```ts
test('uses the waiting perch when the host replaces the prompt', () => {
  expect(choosePerch({ enabled: true, fits: true, dialogOpen: false,
    route: 'session', sidebarVisible: false, promptVisible: false,
    waiting: true })).toBe('waiting')
})
```

- [ ] Implement the selector: `none` for disabled/no fit/dialog/other route; `home` on home; `sidebar` when mounted and visible; `prompt` when visible; `waiting` for an outstanding displayed request; otherwise `none`.
- [ ] Compose `api.ui.Prompt` in `home_prompt` and `session_prompt` slots using the verified registration API. Forward `ref`, `session_id → sessionID`, `visible`, `disabled`, `on_submit → onSubmit`, and nested `home_prompt_right`/`session_prompt_right` slots. Keep the Prompt node outside a changing visibility branch; change only the pet subtree/perch reservation.
- [ ] Reserve enough rows above the prompt for fixed sprite bounds and its hop. Align visible pixels at top-right and nest the bottom pixel row into the host's blank padding. Compute transparent backgrounds per pixel at the boundary. Preserve the original home placeholder examples from `home.tsx` when wrapping the prompt.
- [ ] Mount the sidebar anchor using the footer integration proved in Task 3; left-align visible art above the project path. Register ownership on mount and release on cleanup. Read actual anchor visibility, including a manually opened narrow sidebar, instead of reproducing the host's `>120` width rule.
- [ ] Implement the app-level waiting anchor using verified renderer bounds. Keep it clear of the permission/question panel and hide when insufficient space. If layout bounds cannot reliably identify the safe area through the public API, stop at this gate and resolve the exact fallback with the user.
- [ ] Run `bun test tests/placement.test.ts`. In OpenCode, type an unsent multiline draft, toggle the sidebar, resize across the breakpoint, and confirm one pet plus unchanged draft/focus. Check input nesting, left alignment, attachments, autocomplete, waiting panels, dialogs, and small viewports; record observations.

**Deliverable:** placement responds to real layout changes without losing the prompt or duplicating the pet.

## Task 5: Deterministic mood controller

**Files:** create `src/state/mood.ts`, `tests/mood.test.ts`.

**Consumes:** `Mood` from Task 1 and normalized snapshots supplied by Task 6.

**Produces:** `createMoodController(): MoodController` with no host imports or timers.

```ts
export type Activity = {
  sessionID: string; turnID: string | null; observedLive: boolean
  busy: boolean; waiting: boolean; retry: boolean; runningTools: string[]
  outcome: 'success' | 'error' | 'aborted' | null
}
export type MoodSnapshot = { mood: Mood; since: number }
export type MoodController = {
  update(activity: Activity, now: number): MoodSnapshot
  current(now: number): MoodSnapshot
  nextDeadline(): number | null
  reset(): void
}
```

- [ ] Write a failing no-spurious-completion test:

```ts
test('history does not celebrate; a live successful turn celebrates once', () => {
  const c = createMoodController()
  const a = { sessionID: 's', turnID: 't', observedLive: false,
    busy: false, waiting: false, retry: false, runningTools: [],
    outcome: 'success' as const }
  expect(c.update(a, 0).mood).toBe('idle')
  c.update({ ...a, turnID: 'next', observedLive: true, busy: true,
    outcome: null }, 100)
  expect(c.update({ ...a, turnID: 'next', observedLive: true }, 500).mood).toBe('done')
  expect(c.current(2000).mood).toBe('idle')
  expect(c.update({ ...a, turnID: 'next', observedLive: true }, 2100).mood).toBe('idle')
})
```

- [ ] Add cases for concurrent tools, abort without hop, unknown outcome, retry recovery, priority of waiting, duplicate terminal events, and switching sessions during completion. Run `bun test tests/mood.test.ts` and confirm failure.
- [ ] Implement an explicit state machine with session/turn identity, consumed terminal identity, pending routine mood, and deadlines. Wait 250 ms before thinking/working changes; bypass delay for waiting/error/abort. `current(now)` resolves pending changes and transient expiry without a global timer; `nextDeadline()` returns the earliest pending transition or transient expiry, or null. Keep `since` stable on redundant snapshots so event bursts cannot restart animation.
- [ ] On session switch, reset transient state and establish a baseline; do not mark loaded history as live. At success, require an observed busy turn and an unconsumed successful terminal outcome. At unknown idle, settle to idle. On interruption use 650 ms, completion 1400 ms; errors stay concerned until a new live turn or recovery.
- [ ] Run `bun test tests/mood.test.ts` and `bun run typecheck`.

**Deliverable:** mood decisions are testable with explicit timestamps and robust to real event ordering.

## Task 6: Real session adapter, shared clock, and cleanup

**Files:** create `src/tui/session.ts`, `tests/session.test.ts`, `tests/lifecycle.test.ts`; modify `src/tui/pet-view.tsx`, `src/tui/index.tsx`.

**Consumes:** `Activity`, `MoodController`, catalog/composer, and placement adapters.

**Produces:** `watchActivity(api: TuiPluginApi, emit: (activity: Activity) => void): () => void` and a disposable frame clock.

```ts
// pet-view.tsx exports this small scheduler contract as well as its view.
export type FrameClock = {
  setActive(active: boolean): void
  dispose(): void
}
export function createFrameClock(tick: (now: number) => void): FrameClock
```

- [ ] Inspect SDK 1.18.30 event unions and actual `api.state` reactivity. Normalize messages by current session and current user-turn identity, read active tool parts by ID, and derive successful terminal assistant outcomes using `finish` plus completed time. Treat `tool-calls` as continuation. Map confirmed abort/error variants from the real SDK types; do not infer abort from an idle event.
- [ ] Write adapter fixtures representing SDK events/state, including out-of-order updates and duplicate events. Tests must assert the exact `Activity` shape above, filtering unrelated sessions and treating permissions/questions displayed for the active parent as waiting. Build these fixtures from the inspected SDK declarations, not guessed field names.
- [ ] Implement `watchActivity` using current-route state and public event subscriptions. On attach/re-enable, snapshot current state as a baseline; subsequent changes establish `observedLive`. Track pending child requests surfaced by the parent using public session information and question/permission event session IDs. Dispose all subscriptions and reactive roots together.
- [ ] Implement a single 100 ms interval in `createFrameClock`, with idempotent activation/disposal. Compose frames using `now - moodSnapshot.since`, skip unchanged pixel arrays, and preserve the same controller/clock as the active perch moves. With motion paused, update only on actual state/preferences/layout changes; schedule one timeout from `controller.nextDeadline()` to resolve transients instead of keeping a permanent redraw loop. Cancel that timeout on disposal, session switch, or superseding state.
- [ ] Write lifecycle checks with mock timers. Representative shape:

```ts
test('dispose prevents further ticks', async () => {
  let ticks = 0
  const clock = createFrameClock(() => ticks++)
  clock.setActive(true)
  clock.dispose()
  const before = ticks
  await Bun.sleep(150)
  expect(ticks).toBe(before)
})
```

- [ ] Run `bun test tests/session.test.ts tests/lifecycle.test.ts`, then typecheck/build. Exercise thinking → tools → thinking → completion, question/permission waiting, confirmed interrupt, error/retry, session navigation, and returning to the home screen in a separate OpenCode instance. Use a controlled local fixture for errors instead of inducing destructive tool actions.

**Deliverable:** one real reactive pet with scoped activity and leak-free lifecycle.

## Task 7: Persistent `/pet` controls and extensibility checks

**Files:** create `src/state/preferences.ts`, `src/tui/menu.tsx`, `tests/preferences.test.ts`, `tests/fixtures/catalog.ts`; modify `src/tui/index.tsx` and lifecycle tests.

**Consumes:** `Catalog`, `Appearance`, the controller, active frame clock, and public host dialogs/KV/keymap.

**Produces:** preference helpers and `registerPetMenu(api, get, set): () => void`.

```ts
export type Preferences = {
  enabled: boolean; animate: boolean; character: string
  appearances: Record<string, { skin: string; hat: string }>
}
export const preferenceKey = 'jelly-pet.preferences.v1'
export function normalizePreferences(value: unknown, catalog: Catalog): Preferences
export function selectCharacter(p: Preferences, id: string, catalog: Catalog): Preferences
export function selectedAppearance(p: Preferences): Appearance
// menu.tsx
export function registerPetMenu(
  api: TuiPluginApi,
  get: () => Preferences,
  set: (value: Preferences) => void,
): () => void
```

- [ ] Write failing preference tests covering corrupt saved values, removed IDs, hat `none`, incompatible accessory fallback, and per-character restoration. Example:

```ts
test('keeps the bare jelly choice across validation', () => {
  const p = normalizePreferences(undefined, catalog)
  p.appearances.jelly.hat = 'none'
  expect(selectedAppearance(normalizePreferences(p, catalog))).toEqual({
    character: 'jelly', skin: 'sky-blue', hat: 'none'
  })
})
```

- [ ] Implement validation with safe type guards, copying recognized catalog IDs into a fresh object. Use catalog defaults on missing/invalid entries. Restore each creature's selected skin/hat on switch and keep preference migrations scoped to the namespaced versioned key.
- [ ] Register `/pet` through the verified 1.18.30 `api.keymap.registerLayer` command shape with `slashName: 'pet'`, title `Pet settings`, and category `Pet`. Use `api.ui.DialogSelect` for the main menu and catalog-driven submenus. Include show/hide, character, skin, hat, animate/pause, and reset appearance. Show current choices in labels; explain a single available skin rather than presenting an empty list.
- [ ] Persist through `api.kv.set(preferenceKey, value)` on each accepted change. Changing appearance rerenders the active perch without remounting the input. Hiding stops rendering/animation but leaves menu registration active. Re-enabling resets/reconciles the session baseline so stale completions cannot replay. Reset appearance leaves visibility/animation preferences intact and resets the current character's skin/hat defaults.
- [ ] Add a test-only second character and second skin in `tests/fixtures/catalog.ts`, with a visibly distinct tiny frame and compatible hat list. Confirm normalizers and catalog-derived option lists expose it without altering mood/placement/menu branching. Do not ship this fixture as an approved pet.
- [ ] Run `bun test tests/preferences.test.ts tests/lifecycle.test.ts`, typecheck, and build. In OpenCode, use `/pet` while a draft is present; change hat, hide, show, pause, and restart. Verify saved choices, intact draft, and no model request for settings actions.

**Deliverable:** the plugin is configurable entirely within OpenCode and ready for new catalog content.

## Task 8: Package usability, workflow documentation, and acceptance

**Files:** finish `README.md`, `docs/character-workflow.md`, `docs/integration-evidence.md`, package build metadata, and any integration fixes justified by failures.

**Consumes:** the verified build/load process and all preceding deliverables.

**Produces:** a runnable local package, reproducible demo instructions, and an evidence-backed acceptance record.

- [ ] Document exact successful install/build/load instructions from Task 3, including restart for initial plugin loading and a quick `/pet` usage table. Provide project-local and global configuration examples validated against the actual loader schema. Never include this session's demo key or absolute cache path.
- [ ] Explain the character contract with an actual minimal new character/skin example adapted from the test fixture, the accessory anchor/layer contract, and the required clearances. Show the exact `bun run demo -- --open` command, explicit Superpowers path override, live editing, event feedback, deterministic mood checks, and native verification loop.
- [ ] Record the feasibility decisions for footer wrapping, waiting placement, externalized runtime dependencies, actual terminal size, and any version restriction. Keep observed evidence separate from still-unrun checks.
- [ ] Run `bun test`, `bun run typecheck`, and `bun run build`. If any fail, diagnose and correct the cause before broadening verification. Check the built package includes its entry and runtime artwork and excludes generated demo sessions, keys, test fixtures, and machine-local configuration.
- [ ] Launch the demo from a clean temporary project/package copy using the documented Superpowers override. Confirm live source reload, picker discovery, one-shot replay, all placements, and event recording. Stop the temporary companion afterward.
- [ ] Run the final native matrix: home; first submission; wide sidebar; hidden sidebar; manually opened narrow sidebar; very small height; permission/question; thinking; tools; done once; abort; error/retry; session switch; disabled motion; hide/re-enable; settings persisted after restart. Check no overlap, duplicate pet, lost draft, or orphan timer.
- [ ] Present the working package paths, exact commands, and any remaining validation limitations to the user. Ask for a final visual check in their normal terminal font before adding another character.

**Acceptance:** requirements A/B/C are demonstrated, not merely documented. No Git commit or publication is part of this plan unless separately requested.

## Review checkpoints and coverage

- After Tasks 1–2: approved art parity plus reproducible shared-source Superpowers demo (A).
- After Tasks 3–4: native loading, readable rendering, footer composition, prompt stability, and waiting placement.
- After Tasks 5–7: correct state transitions, separate characters/hats/skins (B), and persistent in-OpenCode controls (C).
- After Task 8: documented fresh-start workflow and full native acceptance matrix.

The uncertain host APIs are deliberately handled as explicit Task 3/4 feasibility gates.
Do not silently replace them with a custom OpenCode fork, an external overlay, or
an input-overlapping fallback. Resolve any failed gate before the dependent task.
