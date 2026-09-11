# Pals shared-art character workflow

## One-off native trials

Use a source checkout with `bun install --frozen-lockfile`, Bun **1.3.13**, and installed OpenCode **1.18.30**. No browser companion, model key, production catalog registration, publish, or global installation is needed:

```sh
bun run try:pal -- ./tests/fixtures/trial-character.ts
bun run try:pal -- "./path with spaces/my-character.ts" --binary "/path/to/opencode"
bun run try:pal -- ./tests/fixtures/trial-character.ts --build-only
bun run try:pal --help
```

`--prepare` and `--build-only` mean the same thing. Flags can precede or follow the one module path; `--` is accepted as the Bun script separator. Relative module paths resolve from the invoking cwd. Source imports should use normal relative/absolute filesystem paths (Bun's bundler does not resolve `file://` source imports). The generated native plugin config uses a properly encoded file URL.

### Trial module contract

The **default export** is one of:

```ts
import type { Character, Hat } from './src/art/types'
import type { PalTrial } from './scripts/native-trial'
// PalTrial = { character: Character; hats?: Hat[] }
```

For example, save this as `my-pal.ts` at the checkout root and run `bun run try:pal -- ./my-pal.ts`:

```ts
import type { Character } from './src/art/types'
import { createFrame, put } from './src/art/raster'

export default {
  id: 'my-pal', name: 'My trial Pal',
  skins: [{ id: 'green', name: 'Green', palette: { body: '#00aa44' } }],
  hats: ['none'], defaults: { skin: 'green', hat: 'none' },
  anchor: { x: 12, y: 12 },
  bounds: { x: 10, y: 10, width: 4, height: 10 },
  draw(pose, skin) {
    const frame = createFrame()
    put(frame, 10, 13 + pose.dy, 4, 7, skin.palette.body!)
    return frame
  },
} satisfies Character
```

For a character with custom accessories, export `{ character: myCharacter, hats: [myHat] } satisfies PalTrial`. `myCharacter` follows the contract above; `myHat` satisfies `Hat` (`id`, `name`, `draw(pose, anchor): Frame`). Import named character/hat exports from ordinary local modules into a small trial module if necessary. The character must list the accessory ID in `hats`; set `defaults.hat` to select it initially.

The trial catalog puts your candidate first and keeps existing characters available for comparison. A matching character ID replaces that definition **only in the trial bundle's memory**. Supplied hat IDs similarly replace/add trial accessories; the built-in `none` cannot be replaced. The candidate is selected explicitly in isolated KV, even when Jelly remains in the generated catalog.

Validation runs before launch: stable lowercase IDs/nonempty names, unique skins and supplied hats, nonempty `#rrggbb` palettes, valid defaults and compatible hats, integer anchor/bounds inside 24×24, draw functions, and sampled 24×24 arrays of 576 opaque `#rrggbb`/`null` pixels across all moods/skins/compatible hats. Bounds must describe the animation/accessory union. Sampling is not an exhaustive art-correctness test. Modules are trusted executable code: importing and drawing them is not sandboxed.

### Inspect, exit, repeat

- The default action launches the actual installed `opencode` found on PATH, then `~/.opencode/bin/opencode`; `--binary` explicitly selects another installed executable. Interactive stdin/stdout/stderr are inherited.
- Each launch has a temporary HOME, XDG config/data/cache/state, cwd and its own `opencode.json` / `tui.json`. Providers and model fetching are disabled; inherited provider credentials and OpenCode overrides are excluded. This visual session does not have your usual projects, auth, plugins, skills or preferences.
- `/pals` offers the candidate, skins and hats through the production native settings menu. `/pals-trial` opens **Pals trial mood**: `idle`, `thinking`, `working`, `waiting`, `done`, `error`, `interrupted`. The forced expression stays selected; transient geometry can settle. Selecting a mood restarts its timeline; `/pals` Pause uses static poses. Host animations-disabled is respected.
- In that same trial menu, **View sidebar (empty local session)** creates only an empty local session and opens its sidebar; **View home** returns home. Waiting mood changes the expression, not the layout into a permission/question panel.
- Quit OpenCode to delete the interactive directory. SIGINT/SIGTERM forward to the child; after five seconds an unresponsive child is killed before cleanup. An externally SIGKILLed helper cannot run cleanup; the printed cleanup command is available in that case.
- Edit your module, then quit/rerun to rebuild and load it. This is a one-shot native build, not hot reload. The production catalog and real global configuration/preferences are never edited by the helper.

### Prepared artifacts and automated native smoke

`--prepare` builds without starting OpenCode and persists under ignored `.superpowers/native-trial/pals-<unique>/`. JSON stdout (status text goes to stderr) reports `directory`, `entry`, `config`, `tuiConfig`, `cwd`, `environment`, `character`, `characterName`, `bounds`, `source` (absolute module path), `sourceHash` (SHA-256 of module bytes), optional discovered `binary`, and `cleanup`; the same object is saved as `trial.json`. Use the reported paths, not a guessed newest directory. Generated bundles externalize Solid/OpenTUI/OpenCode and must run in the native host.

Candidate import and sampled draw validation run in a subprocess whose stdout and stderr both go to the helper's stderr. This preserves `console.log`, `process.stdout.write`, `Bun.stdout`, direct fd-1 writes and deferred diagnostics while reserving prepare stdout for one metadata JSON document. Metadata uses a separate IPC channel, and the helper waits for successful worker exit before building/emitting success. Import/draw failures, early exit without metadata, nonzero exit and deferred errors produce a nonzero CLI exit with diagnostics on stderr and no success JSON. No global console/process stream methods are patched or muted. The worker still runs trusted local code with the invoking cwd, environment and filesystem privileges; output isolation is not a sandbox or protection against intentional IPC/descriptor manipulation, spawned descendants or arbitrary side effects. Runtime candidate logging inside an interactive native trial follows the native host's behavior.

```sh
bun run try:pal -- ./tests/fixtures/trial-character.ts --prepare
# Substitute the directory printed by that command:
python3 scripts/smoke-native.py --trial .superpowers/native-trial/pals-<unique>/trial.json
# After reviewing, run the exact shell-quoted cleanup command printed by try:pal.
```

The smoke consumes the prepared entry, config, cwd, environment and initial preferences, adding a capture probe in its own `smoke/tui.json`. It captures host framebuffer spans and renderable geometry, asserts initial candidate selection and `/pals` discovery, exercises all seven moods through real slash autocomplete, and inspects home/sidebar. For `trial-character.ts`, it additionally checks a hand-derived 4-column/7-row perch, 28 green pixels at idle, and 26 green + 2 yellow pixels for error. Its guarded local proxy rejects model-submission endpoints; only empty session creation is allowed. No interactive user terminal is controlled. Evidence is in the prepared directory's `smoke/` (`result.json`, captures, `proxy.json`, `process.json`, `terminal.ansi`). The smoke changes only the prepared trial's preferences/session state; prepare afresh for a clean rerun.

The demonstration pixel oracle requires the checked-in fixture's exact source path and pinned content hash in the prepared manifest. Adaptations (including those retaining `trial-sprout`), copies, and older manifests without source identity use generic selection, menu and geometry checks; candidate-specific pixel correctness needs its own oracle. `--trial` is a standalone smoke mode, not combined with `--entry`, installation or other fixture modes. `--binary` on the smoke command selects its installed host. The prepared directory persists until its printed cleanup command is run.

## Browser preview prerequisites and launch

Use Bun **1.3.13**, Bash, Node (required by the installed companion), and an installed Superpowers package with `skills/brainstorming/scripts/start-server.sh`. This demo targets the OpenCode **1.18.30** placement study. Install project dependencies with `bun install --frozen-lockfile` if needed. Runtime versions and the art's 24 × 24 coordinate system stay unchanged.

From the project root:

```bash
bun run demo -- --open
```

This invokes the **installed** Superpowers launcher with Bash and separate arguments, builds `demo/browser.ts` with Bun, and publishes a new self-contained full HTML document. No companion source is copied into this project. The browser bundle imports `src/art/catalog.ts` and `src/art/compose.ts` directly; there is no parallel sprite implementation or Solid/OpenTUI runtime in the demo.

Discovery order:

1. `--superpowers-dir "/path/to/superpowers"` (package root or brainstorming skill directory).
2. `SUPERPOWERS_DIR` with either of those directory forms.
3. Project `node_modules/superpowers`; the OpenCode package/legacy skill locations under `~/.config/opencode`; `~/.agents/skills` and `~/.claude/skills` brainstorming locations; then installed Superpowers packages discovered beneath `${XDG_CACHE_HOME:-~/.cache}/opencode/packages`.

An invalid explicit/environment override fails with the missing `brainstorming/scripts/start-server.sh` prerequisite and override syntax instead of silently using a different install. The OpenCode installation guide is the installed package's `.opencode/INSTALL.md`; the protocol guide is `skills/brainstorming/visual-companion.md`. After any OpenCode config-time installation change, quit and restart OpenCode before validating that installation. The demo itself does not write OpenCode configuration.

Portable override examples:

```bash
bun run demo -- --open --superpowers-dir "/path/to/superpowers"
SUPERPOWERS_DIR="/path/to/superpowers/skills/brainstorming" bun run demo -- --open
```

## Edit → preview → feedback

1. Keep the demo command running. It prints the **complete authenticated URL**, published screen path, state directory, and events path. Use that URL including `?key=…`; the companion may subsequently remove the query from the address bar after establishing its session cookie.
2. Edit shared art in `src/art/` or the preview in `demo/`. Both trees are watched recursively. Writes debounce for 180 ms; builds are serialized. A build failure prints an error and leaves the prior screen available.
3. Each successful build writes `pals-<timestamp>-<counter>.html` using exclusive creation, preserving old documents. The companion automatically loads the newest revision. The original v9 oracle is preserved independently in `tests/fixtures/approved-v9.js`.
4. Inspect the shared production hero and native placement views (Jelly: 14 × 16 half-cell crop, displayed at 112 × 128 px for 8 × 16 terminal cells; hero at 224 × 256 px). Every canvas uses the same selected pose; only scale differs. Original art is separately labeled in `scripts/three-quarter-visual.ts` comparison evidence. Pick character, skin, or hat; compare no hat with lavender bucket. These choices come from the shared catalog and call the companion's `toggleSelect` helper.
5. Try all seven moods; use **Pause**, **Replay**, or the **Time** slider (0–10 seconds) to inspect a pose. Scrubbing pauses playback; Replay starts at zero and resumes. The elapsed readout continues beyond the slider's inspection window during normal playback. Reduced motion freezes automatic time and uses the composer's static poses. One 100 ms clock drives the canvases and unchanged pixel frames skip drawing.
6. Switch between **Before first prompt**, **Sidebar open**, **Sidebar hidden**, and **Waiting panel**. Exactly one Pal is visible inside the placement/waiting preview; the separate enlarged art study remains visible.
7. Read selections before editing again:

   ```bash
   bun run demo -- --events
   ```

   The companion records choices like `character:jelly`, `skin:sky-blue`, `hat:none`, and `hat:lavender-bucket` as JSON lines. Its events file is cleared when a new screen is published. Combine those selections with feedback given in the terminal. Demo controls are in-memory only and do not affect real OpenCode KV/settings.

8. Repeat the edit → automatic preview → selection → events/terminal feedback loop. Use **Waiting panel** when discussion returns to the terminal.

## Session lifecycle

`.superpowers/demo/session.json` stores returned connection info and the resolved launcher. `.superpowers/` is already ignored. Screens and events use the exact directories returned by the launcher, never a guessed session. Before each publish the command checks that `state_dir/server-info` exists and `state_dir/server-stopped` does not; if needed it restarts via the launcher with the same project root.

Press **Ctrl-C** to finish watching. SIGINT/SIGTERM stop accepting edits, discard pending rebuilds, and wait for an active launch/restart/publication to finish before exiting. Signal handling is installed before the first publication; repeated signals also wait. The launcher runs in its own process group so a terminal-wide signal cannot interrupt startup before its returned session is saved. Metadata is replaced atomically after its complete write. Wait for the command to exit, then:

```bash
bun run demo -- --stop
```

This runs the installed `stop-server.sh` against the parent of the returned state directory. It preserves persistent screens and metadata. If a watcher remains running, the next source edit will restart the stopped companion. Restart the demo command after changing `scripts/` itself.

**Concurrent companion sessions:** the launcher can fall back to a new port/key if the project's remembered port belongs to the existing brainstorming session. This occurred during local verification: a stopped demo restarted successfully on a different URL while the original session remained intact. Always use the latest printed full URL after a restart; automatic same-tab recovery is not guaranteed in that collision case. `--open` is passed on new launches. When reusing a live saved session, `--open` opens the complete authenticated URL once after publishing, using the platform browser opener (`open` on macOS, `xdg-open` on Linux, `rundll32.exe` on Windows). Subsequent hot reloads do not reopen tabs or launch competing sessions. An opener failure is reported with the printed URL available for manual use.

## Verified locally (2026-09-10)

Exact successful commands:

```bash
bun test tests/demo.test.ts
bun test tests/demo-lifecycle.test.ts
bun test
bun run typecheck
nohup bun run demo -- --open > .superpowers/task-2-demo.log 2>&1 &
bun run demo -- --events
bun run demo -- --stop
```

The background form kept the watcher alive across coding-agent tool calls; in an ordinary terminal use `bun run demo -- --open` directly. No explicit installation path or environment override was required locally.

Browser verification covered every catalog picker, all seven moods/captions, all four layouts, completion settling/replay, exact 400 ms scrubbing, paused frames, reduced motion, 24 × 24 canvases with smoothing off, and all layouts at 390 px without horizontal overflow. Instrumentation observed one changed hero frame over 1050 ms of working animation and zero canvas redraws over 400 ms while paused.

The eyebrow label was changed to `SHARED ART STUDY · HOT RELOAD CHECK`, observed automatically in the open browser as a fresh screen, then reverted and observed automatically again. Initial/edit/revert filenames were `pet-1789015014696-1.html`, `pet-1789015117972-2.html`, and `pet-1789015141819-3.html`. Catalog clicks then appeared in `--events`. A real `--stop` followed by another harmless label edit also exercised automatic launcher restart; that label was reverted too.

Detailed historical results and concerns: `.superpowers/sdd/2026-09-10-blue-jelly/task-2-report.md`.

## Add a character and two skins (actual minimal fixture)

Work in a disposable source copy until its art is approved. This example adapts `tests/fixtures/catalog.ts`; it was exercised in both browser and native pickers during Task 8 (now `/pals`). It is deliberately a simple colored square, not an approved second creature. Create `src/art/sprout.ts`:

```ts
import type { Character } from './types'
import { createFrame, put } from './raster'

export const sprout: Character = {
  id: 'sprout', name: 'Test sprout',
  skins: [
    { id: 'green', name: 'Green', palette: { body: '#00aa44' } },
    { id: 'gold', name: 'Gold', palette: { body: '#ffaa00' } },
  ],
  hats: ['none'], defaults: { skin: 'green', hat: 'none' },
  anchor: { x: 12, y: 12 },
  // Union of visible positions, including the maximum three-pixel hop.
  bounds: { x: 10, y: 13, width: 4, height: 7 },
  draw(pose, skin) {
    const frame = createFrame() // transparent 24 × 24
    put(frame, 10, 16 + pose.dy, 4, 4, skin.palette.body!)
    return frame
  },
}
```

For a native one-off, add `export default sprout` to that module and run `bun run try:pal -- ./src/art/sprout.ts`. After approval, register it in `src/art/catalog.ts` for the shared browser/production catalog:

```ts
import { compactJelly, compactBucket } from './compact'
import { sprout } from './sprout'
import { none } from './hats'
import type { Catalog } from './types'

export const catalog: Catalog = {
  characters: [compactJelly, sprout],
  hats: [none, compactBucket],
}
```

The watcher publishes a new screen automatically. Select **Test sprout → Gold**, then run `bun run demo -- --events`: expect `character:sprout` and `skin:gold`. Neither the browser's picker implementation nor the native menu/controller needs a character-specific branch. To add a palette-only jelly skin, append a stable ID/name and a complete semantic palette to `jelly.skins`; retain the original palette keys, geometry, and readable contrast.

### Contract and clearances

- `Character` owns IDs, names, `skins`, compatible hat IDs, defaults, anchor, bounds, and `draw(pose, skin)`. `Pose` supplies `dy`, `eyeDx`, `blink`, and the standard seven-mood vocabulary. Return a fresh 24 × 24 frame of opaque `#rrggbb` or `null` pixels. Do not introduce timers into art definitions.
- The composer draws the **base/face first, then the hat layer**. `Hat.draw(pose, anchor)` returns another transparent 24 × 24 frame; opaque accessory pixels replace base pixels. The current API has one foreground accessory layer, not arbitrary z-layers. Compatibility lives on `Character.hats`; `none` is always accepted. Include `none` in the catalog and use existing IDs in defaults.
- Apply the same motion transform exactly once to both body and accessory. Compact Jelly uses `Math.sign(pose.dy)` for one-half-cell work/error/hop movement; full-size references retain the original offsets. Hat coordinates are relative to the character anchor. Thinking moves eyes/blinks while body/hat stay still. Keep the tiny line mouth and unchanged head silhouette.
- Jelly's bucket has an uneven, asymmetric downturned hem with intentional gaps. Preserve **one visible blue source-pixel row between brim and working eyebrows** in every skin/pose. Keep face pixels clear of opaque accessory pixels. These are art/test requirements, not a runtime collision solver; the current `Character` type has no declarative face-clearance field.
- Declare the fixed union of visible art across all compatible hats and animations. Compact Jelly's union is `{ x: 2, y: 2, width: 14, height: 14 }`, including its one-pixel hop. Its hatted footprint is 14 columns × 13 source pixels (seven occupied terminal rows). Every native perch crops to the selected character's horizontal bounds and sizes from its vertical union; new art can use the full 24 × 24 canvas. The crop never follows individual animation frames, so hops retain stable alignment.
- Native geometry adds one blank cell above the union (plus a top half-pixel when needed to pair its bottom row): Jelly has a 14×16 crop / nine-row perch and eight-row prompt reservation. Prompt nesting uses only blank input padding. Sidebar adds one further blank margin row before the path. Waiting uses the full reservation; measured available space must fit the selected geometry plus request clearance. Never enlarge artwork into editable text, attachment labels, footer text, or request controls.
- `src/art/compact.ts` is the production small drawing, shared by browser placement and native rendering. `jelly.ts`, `hats.ts`, `referenceCatalog`, and all 42 approved v9 fixtures retain the full-size source. Compact facial features and brim clearance are deliberately authored rather than automatically resampled. This is the default drawing, with no size picker.

### Deterministic review points

With normal motion enabled, select a mood then move **Time** to pause at an exact millisecond. Useful checks (the slider steps by 100 ms):

| Mood | Inspect |
| --- | --- |
| Idle | 0/100 ms blink, 200 ms open eyes |
| Thinking | 1000 ms center; 1100–2900 ms side glance; 3000 ms center; 3700 ms blink |
| Working | 0 and 1200 ms; whole body and hat move together by at most one pixel |
| Waiting | Attentive hold; all demo canvases share the selected mood and pose |
| Finished | 400 ms hop, 900 ms grounded, 1500 ms idle; Replay starts one new hop |
| Error | 0/200 ms recoil, 300 ms concern |
| Interrupted | 600 ms calm reset, 700 ms idle |

Reduced motion freezes automatic time and displays static expressions. Pause freezes the current animated frame; reduced motion selects a static pose, so these controls have different purposes. Use tests for exact boundaries not reachable with the slider's 100 ms step.

### Native verification loop

1. Review enlarged/small demo views; read events and discuss visual feedback.
2. Run `bun test`, `bun run typecheck`, and `bun run build` in the edited source copy.
3. Install its `dist/index.js` via project `tui.json` as in the README; quit/restart OpenCode.
4. Use `/pals → Character → Test sprout → Skin → Gold`. Confirm immediate change, `None` compatibility, one visible Pal, and retained draft/focus. Switch back to Jelly before approving geometry.
5. Run isolated zero-model acceptance: `python3 scripts/smoke-native.py --preferences --installation local`, then the same command with `--restart`. The fixture additionally checks sprout/Green/Gold discovery when that temporary character is registered. The activity pixel verifier expects the approved Jelly catalog/defaults.
6. Remove the temporary registration when finished. Keep the approved production catalog Jelly-only until another character has visual approval.

To reproduce a clean source-copy run, `bun scripts/prepare-acceptance.ts` prints a fresh temporary root with no dependencies, build, sessions, or inherited user config copied. In that directory run `bun install --frozen-lockfile`, build, and the explicit Superpowers override above. The runtime archive intentionally does not contain the demo sources.

Task 8 freshly verified the documented override, live registration/reload, all seven moods/four placements, one-shot replay, 400 ms scrubbing, reduced motion, selection events, and native second-character/two-skin discovery. A reused-session opener failure now reports the manual URL **and continues watching**. See the Task 8 section in [integration-evidence.md](integration-evidence.md) for final scope and limitations.
