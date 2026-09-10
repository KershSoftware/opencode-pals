# OpenCode Pals — 1.18.30 integration evidence

**Historical evidence:** Task 8 supersedes the old plugin-manager reactivation limitation. The final Pals rebrand uses package/plugin ID `opencode-pals`, `/pals`, **Pals settings**, and migrated `opencode-pals.preferences.v1`. Older names and dimensions below describe historical captures, not current setup. Current geometry is 14 columns × 13 visible pixels, 14×16 crop, nine-row perch, eight-row prompt reservation and one sidebar margin row. See README and the design-record amendment for current requirements.

## Task 3 — native feasibility

Recorded 2026-09-10. **Native loading, static pixel rendering, and footer composition are proven in the installed binary. Actual user-terminal font/size approval remains outstanding.**

**Controller ruling after review:** normal-font visual approval is deferred to final acceptance and does not block integration. No such visual approval has occurred. R2's footer assertions were tightened and both native modes rerun; see the appended review follow-up in `task-3-report.md`.

## Versions and runtime boundary

| Component | Evidence / version |
| --- | --- |
| Installed executable | `~/.opencode/bin/opencode --version` → `1.18.30` |
| Local build/test Bun | `bun --version` → `1.3.13` (`bf2e2cec`) |
| Bun embedded in the native executable | Smoke fixture's `Bun.version` → `1.3.14` |
| Plugin and SDK declarations | Installed `@opencode-ai/plugin` / `@opencode-ai/sdk` `1.18.30` |
| OpenTUI core / Solid / keymap | Installed and upstream-pinned `0.4.5` |
| Solid runtime | Project and upstream catalog pin `1.9.10`; upstream patches that version |
| TypeScript | `5.8.2` |
| OpenTUI compiler preset / package peer | `babel-preset-solid` `1.9.12`; `@opentui/solid@0.4.5` declares `solid-js: 1.9.12` |

The Solid peer discrepancy is real, not silently fixed by upgrading. The [pinned upstream root package](https://github.com/anomalyco/opencode/blob/v1.18.30/package.json) selects Solid `1.9.10`, OpenTUI `0.4.5`, TypeScript `5.8.2`, and `packageManager: bun@1.3.14`. Its [Solid patch](https://github.com/anomalyco/opencode/blob/v1.18.30/patches/solid-js%401.9.10.patch) changes transition/cleanup behavior. The local Bun CLI was not upgraded.

`scripts/build.ts` uses the installed **named** `createSolidTransformPlugin` export from `@opentui/solid/bun-plugin`. Declaration evidence: `node_modules/@opentui/solid/scripts/solid-plugin.d.ts:1–11`; the package also exports a default plugin and `ensureSolidTransformPlugin`. The implementation in `scripts/solid-transform.js:30–64` runs Babel's Solid universal transform with `moduleName: '@opentui/solid'`.

External patterns are explicitly `solid-js`, `solid-js/*`, `@opentui/*`, `@opencode-ai/*`. Build metadata rejects bundled host-runtime inputs. The final 9,999-byte `dist/index.js` has only three distinct runtime import specifiers: `@opentui/solid`, `@opentui/core`, `solid-js`. `@opencode-ai/plugin/tui` is a type-only import and disappears. All ten bundle inputs in `dist/metafile.json` are project `src/` files. The native test additionally retrieves the host registry containing `internal:sidebar-footer`, which would not work with a duplicate Core registry runtime.

The [pinned TUI runtime](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/plugin/tui/runtime.ts) calls `ensureRuntimePluginSupport({ additional: keymapRuntimeModules })` before external loading. The installed OpenTUI runtime bridge (`node_modules/@opentui/solid/scripts/runtime-plugin-support-configure.js:12–19,42–71`) supplies host Solid, Solid store, and OpenTUI modules. The plugin does not install its own bridge or bundle these runtimes. Successful native rendering validates this compiler/host combination for the static view, not arbitrary future Solid APIs.

## Exact loader and config contract

Sources inspected before writing any smoke config:

- Published [TUI JSON schema](https://opencode.ai/tui.json): `plugin` is an array of strings or `[string, object]` pairs. `plugin_enabled` is a boolean map. Retrieved before config creation.
- Published [server config schema](https://opencode.ai/config.json): resolved its `$ref: '#/$defs/Config'` and inspected `$schema`, `enabled_providers`, `autoupdate`, `share`, `plugin`, `mcp` before creating the isolated server config.
- [Pinned TUI schema implementation](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/config/index.tsx): `Info`, `PluginSpec`, and `PluginOptions` confirm the version-matched shape. Published schemas are live; pinned code is the version authority.
- [Pinned TUI config loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/config/tui.ts): global TUI config, explicit `OPENCODE_TUI_CONFIG`, project `tui.json[c]`, then discovered config directories; paths resolve against the declaring config.
- [Pinned shared module loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/plugin/shared.ts): `readV1Plugin` requires a **default-exported object with `tui()`**. A local path plugin must supply a nonempty `id`. Named functions alone or a default function are not the supported shape. Npm packages use `exports['./tui']`; direct local files load directly.
- [Pinned plugin loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/plugin/loader.ts): resolution/import stages; runtime initialization is sequential after external module loading.

The actual entry is:

```ts
const tui: TuiPlugin = async (api, options) => { /* scoped slot registration */ }
export default { id: 'opencode-pals', tui } satisfies TuiPluginModule
```

Installed type evidence: `node_modules/@opencode-ai/plugin/dist/tui.d.ts:505–510`. This is a **TUI plugin**, configured through `tui.json`, not the server-plugin array.

## Registry API and composition proof

Installed declarations:

- `@opentui/solid/src/plugins/slot.d.ts:5`: `SolidPlugin` aliases Core `Plugin<JSX.Element, ...>`.
- `@opentui/core/plugins/types.d.ts:21–29`: slot callback is `(ctx, props) => node`; plugin has `setup(ctx, renderer)`, `order`, `dispose`, and `slots`. There is **no middleware or `next` argument**.
- `@opencode-ai/plugin/dist/tui.d.ts:398–405`: public `api.slots.register()` returns a **string ID**, not a disposer or previous renderer; caller-supplied slot-plugin IDs are forbidden.
- `@opentui/core/plugins/registry.d.ts:24–35`: the registry itself exposes `register → disposer`, `unregister`, `subscribe`, and `resolveEntries → { id, renderer }[]`.

The host's [slot setup](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/plugin/slots.tsx) creates a Solid registry with a newly allocated `{ theme: api.theme }` context. Calling `createSolidSlotRegistry(api.renderer, { theme: api.theme })` from the plugin **throws**, because the context must be the identical object. This was tested in both native runs, not assumed.

Supported route used by `src/tui/footer.ts`:

1. Register an empty scoped plugin whose public `setup(ctx, renderer)` obtains the **original context**.
2. Call `createSolidSlotRegistry(renderer, ctx)` there. The installed factory uses the renderer's single `solid:slot-registry` key (`@opentui/solid/index.bun.js:1326–1328`). Core returns the existing registry only for identical context (`@opentui/core/index.bun.js:2177–2189`). Passing empty options does not erase the host's error handler.
3. Read `resolveEntries('sidebar_footer')`. Proceed only when the sole entry is `internal:sidebar-footer`.
4. Register our wrapper at order **99**. The [built-in footer](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/feature-plugins/sidebar/footer.tsx) is order **100**. Ascending order wins; [sidebar](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/routes/session/sidebar.tsx) uses `mode='single_winner'`. Installed Solid selects `resolvedEntries[0]` (`index.bun.js:1473–1478`).
5. Render the sprite, one `Jelly static: working/thinking` proof row, and call the **original renderer** with the actual context and props. This preserves path/version behavior without reproducing private host components.
6. Subscribe to registry changes. Any competing footer contribution, or removal/replacement of the original, unregisters **only our own wrapper**. Existing competitors prevent installation entirely, regardless of their order. The original remains registered and is never deactivated.

This is public-registry composition, **not a nonexistent middleware API**. No path/version adapter was necessary. No private renderer field, symbol lookup, patched registration method, or duplicated built-in source is used.

### Caveats

- This retrieval/composition route is verified specifically for OpenTUI `0.4.5` and OpenCode `1.18.30`; it depends on the documented factory plus the pinned host's original-context setup and built-in ID/order.
- Once displaced, the wrapper stays absent until plugin reactivation/restart. The plugin may still be listed `active` while its footer contribution has yielded. Automatic reappearance is deferred.
- If the built-in is disabled or a custom footer is already present, this static feasibility plugin shows no pet. It does not seize the slot or provide another placement.
- The built-in getting-started panel was dismissed only in the isolated smoke KV to make room. Delegation retains the original renderer, but that panel's interactive behavior was not exercised.

## Reproduction and isolation

From the project root:

```sh
bun test tests/encode.test.ts
bun test
bun run typecheck
bun run build
python3 scripts/smoke-native.py --mood working
python3 scripts/smoke-native.py --mood thinking
bun scripts/verify-native.ts
```

Each Python invocation starts a **fresh process** of OpenCode (override with `--binary /path/to/opencode`), cwd the repository root, on a 160-column × 50-row PTY. It writes local configs under `.superpowers/native-smoke/<mood>/` and selects them with `OPENCODE_TUI_CONFIG` / `OPENCODE_CONFIG`. These are explicit project-local smoke overrides.

The generated `tui.json` contains the absolute local equivalents of:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "theme": "opencode",
  "plugin": [
    ["../../../dist/index.js", { "mood": "working" }],
    ["../../../tests/fixtures/native-smoke.tsx", { "artifacts": "<local smoke output directory>", "mood": "working" }]
  ]
}
```

The fixture is test instrumentation, not part of `dist/index.js`. Server config uses `enabled_providers: []`, `autoupdate: false`, `share: 'disabled'`, empty plugins/MCP. Environment is explicitly constructed with isolated HOME, `OPENCODE_TEST_HOME`, XDG config/data/cache/state, and TMPDIR, plus `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_AUTOUPDATE=1`, and `OPENCODE_DISABLE_MODELS_FETCH=1`. `OPENCODE_PURE` is not used because it would prevent the external plugin loading being tested. No credentials are inherited.

The fixture creates an empty local session, navigates to it, and deletes it after the checks. It never submits a prompt or invokes a model endpoint. Both final runs assert zero enabled providers and zero session messages. The native screen also reports 0 tokens / $0.00. Logs show only local config paths; a host duplicate-`archify` skill warning reveals that upstream still scans external ancestor skills. Those files were not changed.

Restart is required after changing a config-time install/build; the harness does this on every run. No global user config was edited. Processes are bounded and reaped; the final runs used SIGTERM fallback after the UI did not exit within the Ctrl-C grace period. Thus clean **process removal** is proven, not graceful TUI shutdown.

## Native observations and artifacts

For each mood, `.superpowers/native-smoke/<mood>/` contains:

- `tui.json`, `opencode.json`, `process.json`: exact configs, executable, cwd, environment, PTY dimensions, PID, exit, elapsed time, captured byte count.
- `terminal.ansi`: actual PTY output bytes from the installed binary.
- `decorated.txt/json`: native framebuffer characters and color spans with the static pet and original footer.
- `baseline.txt/json`: framebuffer after deactivating the pet; original footer remains.
- `competing.txt/json`: later custom footer is visible and the pet is absent.
- `restored.txt/json`: removing the competitor restores the built-in footer; the pet stays withdrawn.
- `result.json`: asserted loading/composition results, host version, embedded Bun, zero slot errors, zero providers/messages.
- `pixels.json`: independent framebuffer-to-art comparison results.
- `native-frame.svg`: reconstruction **from captured host color spans**, using nominal 8×16 cells. This is a review aid, not a screenshot of the user's terminal font.
- `data/opencode/log/opencode.log`: isolated host log.

Both modes: one sprite at zero-based **(120,32)** through **(143,43)**, exactly **24×12 cells / 576 pixel halves**, background `#141414`. Every opaque half equals Task 1's composed art pixel; every transparent half equals the native panel background. Verification independently indexes the original `Frame`, without using `encodeFrame` to compute its expected halves. It also rejects duplicate/wrapped/clipped sprite cells in the sidebar. This preserves body/hat colors, the approved silhouette, brim/eyebrow spacing, and thinking's tiny-line mouth at the framebuffer level. There are no literal escape characters in captured text cells and no registry errors.

Original footer rows survived byte-for-byte (ignoring surrounding layout whitespace):

```text
/workspace/projects/opencode-
pals
• OpenCode 1.18.30
```

After R2, preservation is asserted as an ordered array within the rightmost 42 columns and bottom 7 rows of each capture. Decorated/restored footer suffixes must exactly equal the normalized baseline footer rows; the static label is outside that suffix. Whole-screen path/version searches are removed. Capture-level negative tests reject a missing sidebar path even when the main status path remains, and reject reordered path/version rows. Both 160×50 native smoke modes passed with these stronger checks.

**Unverified visual item:** the user's actual terminal font, normal font size, and glyph rasterization/aspect ratio were not observable through the controlled PTY. The cell/pixel proof and SVG reconstruction must not be represented as that visual approval. The Task 3 sections above describe the historical static feasibility build; Task 4 placement evidence follows.

## Task 4 — single-pet placement (2026-09-10)

**Implemented and verified in installed OpenCode 1.18.30. Normal-font visual acceptance remains pending for the controller's final acceptance.**

### Prompt and ownership contract

`src/tui/placement.ts` exports the brief's exact `Perch`, `PerchInput`, and pure `choosePerch(input)` contract. Suppression precedes home, mounted/visible sidebar, visible prompt, and displayed outstanding request. `src/tui/anchors.tsx` supplies mounted home/session Prompt, sidebar, and waiting adapters. One controller selects a specific owning renderable, not just a perch name. Mount/cleanup registers/releases owners. A single 100 ms layout sampler reads actual public bounds; equal snapshots do not invalidate Solid. The controller's Solid root, interval, and event subscriptions are disposed with the plugin.

The home/session wrappers compose `api.ui.Prompt`, forwarding `ref`, `session_id → sessionID`, `visible`, `disabled`, and `on_submit → onSubmit`. Both nested right-hand slots render successfully. The exact pinned home normal/shell placeholder arrays are retained. The Prompt is outside the changing pet `Show`; only the pet and its reservation change during layout, dialog, or enabled-state transitions.

Pinned sources additionally inspected:

- [`routes/home.tsx`](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/routes/home.tsx): placeholder arrays and replace-mode Prompt slot.
- [`routes/session/index.tsx`](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/routes/session/index.tsx): main bottom-sticky scroll, input container, parent/child requests, and wide versus manually opened narrow sidebar mounts.
- [`app.tsx`](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/app.tsx): `app_bottom` is a normal-flow, nonshrinking sibling **below** the session route container.
- [`plugin/adapters.tsx`](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/plugin/adapters.tsx): public Prompt forwarding and route adapter. `route.navigate('session', params)` forwards only `sessionID`; it discards a supplied `params.prompt`. A route-seeded-ref test was therefore invalid and was removed, not reported as passed.
- [`context/sync.tsx`](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/tui/src/context/sync.tsx): request-event handling and session snapshot updates. The host handles `session.updated`, not `session.created`, to add the child fixture's snapshot.

**Host lifecycle limit:** the host wraps the whole session prompt slot in `Show(visible())`, and unmounts it during permission/question requests. This plugin does not add another unmount on sidebar changes. The native test asserts **editor object identity, draft contents, and focus** across layout/enable/dialog transitions; it does not claim identity retention across the host's own request-driven unmount.

### Pixel placement and sidebar composition

Original 24×24 frames and all art coordinates/colors are unchanged. The view displays columns 3–20, the catalog's fixed union of visible art, excluding only always-transparent side columns. Slicing encoded columns avoids an observed OpenTUI negative-x text-clipping offset. This makes the visible-art union flush with the prompt's right edge and the sidebar footer's left edge.

The prompt reserves 12 rows and renders a 13-row view using a one-pixel vertical offset. Its final source pixel row occupies the upper half of the host's blank padding immediately above the input. Transparent halves above the boundary use `theme.background`; padding halves use **`theme.backgroundElement`**. Native colors with the `opencode` theme are `#0a0a0a` and `#1e1e1e`. Sidebar transparency uses `backgroundPanel` (`#141414`). These distinct backgrounds are independently checked against neighboring captured host cells.

Sidebar mounting still uses the exact registry-context footer composition established in Task 3. The original path/version renderer is delegated unchanged. The art appears above it, left aligned. A custom footer causes our wrapper to yield, releases sidebar ownership, and moves the single pet to the prompt. Removing that competitor restores the original footer but does not reinstall our yielded sidebar wrapper until reactivation/restart, matching Task 3's policy.

### Waiting fallback: measured normal-flow reservation

The chosen app-level fallback is **`app_bottom`**, not an absolute overlay. Its 13-row reservation reduces the message scroll area and places the pet below the session, keeping the real request panel above it. No panel position or terminal-width breakpoint is guessed.

While the prompt exists, its public parent/children chain identifies the actual main session `ScrollBoxRenderable`. That reference survives prompt replacement. On cold entry during a request, the unique public `stickyScroll && stickyStart === 'bottom'` scroll is used; ambiguous/missing evidence fails closed. The measured scroll plus any existing waiting reservation must spare 14 rows (13 reserved plus one remaining scroll row). The existing reservation is included to prevent on/off layout oscillation.

**Important renderer finding:** `Renderable.height` may retain/clamp a zero-sized renderable to one cell. `getLayoutNode().getComputedHeight()` exposes the actual zero. The waiting and tall-prompt fit checks use that public Yoga measurement. At 110×24 the short permission panel leaves two scroll rows and the waiting pet fits. The taller question panel would leave zero, so it hides. At 110×22 the pet is suppressed. A ten-line draft at 110×24 also hides the prompt pet stably without changing the draft/editor.

Current-session and displayed direct-child requests are recognized through public state, request events, and initial read-only permission/question list queries. Missing request/bounds data hides the waiting pet. The sidebar still takes priority when mounted and visible, including a manually opened narrow sidebar.

### Reproduce current placement evidence

Run sequentially with the unit suite outside native processes to avoid load-sensitive demo-test timeouts:

```sh
bun test tests/placement.test.ts
bun test
bun run typecheck
bun run build
python3 scripts/smoke-native.py --placement --mood working
python3 scripts/smoke-native.py --placement --mood thinking
bun scripts/verify-placement.ts
```

Final results: **11/11 placement tests**, **42/42 total tests**, typecheck/build success, **35 native captures per mood**, zero slot errors, zero providers and session messages. Independent framebuffer verification checks **3,096 pixel halves per mood** across seven representative captures, including all opaque art and whole-screen duplicate/clipping detection. Both moods have exactly 238 opaque art halves per checked capture. The 21,780-byte build retains external Solid/OpenTUI/OpenCode runtimes.

`--placement` extends the existing isolation harness. A real isolated `opencode serve` runs behind a loopback SSE proxy, and a fresh installed `opencode attach` runs in the PTY. All REST traffic goes to the real local server. Synthetic permission/question events and one child-session `session.updated` snapshot exercise the **actual host panels**, without invoking tools/models or patching TUI state. Only two POSTs occur, both `/session`, creating empty parent/child fixture sessions; both are deleted on the successful path. Read-only model/provider discovery is normal host bootstrap, not a model API call. The proxy rejects POST prompt/command/shell endpoints. Original and injected SSE events are emitted as complete blocks. Configs, HOME/XDG, and KV are project-local; no credentials are inherited and no global config is edited.

Artifacts in `.superpowers/native-smoke/placement-{working,thinking}/`:

- `result.json`: the final assertion result and 35 named observations.
- `<capture>.txt/json`: native framebuffer text/color spans and public renderer tree with computed heights.
- `terminal.ansi`: actual PTY output, not an SVG approximation.
- `process.json`, `proxy.json`: exact process/environment/input/resize/request/event provenance and process exits.
- `pixels.json`: independent original-art comparisons and POST endpoint audit.
- `child-state.json`: real empty child session plus its host snapshot.

The two final attached TUIs and servers were reaped via SIGTERM (`-15`) after the TUI's Ctrl-C grace period, so graceful TUI exit is not claimed. Historical Task 3 artifacts remain under `working/` and `thinking/`; its old static-label fixture/verifier is archival and is not the command for the current placement build. Older `failure.*` files in placement directories can remain from debugging; use the final `result.json` and its named observations.

### Remaining acceptance / scope

- **Pending:** the user's normal-font visual acceptance, deferred by the controller. Neither PTY cells nor framebuffer reconstruction implies approval.
- The request events are synthetic; actual tool permission generation, approval execution, and server-side question resolution are not tested.
- File `@package.json` autocomplete/selection and its text/editor retention through resizing are exercised; clipboard image decoding and OS drag/drop attachment paths are not.
- Native autocomplete remains above the sprite and can temporarily occlude it; menu entries and selection stay usable.
- The Task 4 entry still consumes a static Task 3 frame. Animation, appearance controls, and `/pet` command UI are subsequent integration work. The immediate placement toggle currently consumes host KV key `jelly-pet.enabled` (default `true`), independently of any future command UI.

## Task 6 — reactive activity and lifecycle (2026-09-10)

The current entry now consumes the reviewed mood controller through a real SDK 1.18.30 state/event adapter. One shared 100 ms animation clock publishes changed frames; paused motion uses `nextDeadline()` timeouts. The old placement polling interval is replaced by a passive public post-layout observer. Host KV enable/motion/appearance changes are reactive.

Current reproduction:

```sh
bun test tests/session.test.ts tests/lifecycle.test.ts
bun test
bun run typecheck
bun run build
python3 scripts/smoke-native.py --activity
bun scripts/verify-activity.ts
```

Final results: **102 unit tests**, typecheck/build success, **25 native captures**, **11,412 pixel halves**, zero slot errors, and zero model calls. The proxy permits only empty-session creation POSTs; the final audit records three creations and deletions. Native explicit plugin disposal removes the pending deadline, shared interval, and layout observer. Full details, source evidence, coverage, and artifact provenance are in [the Task 6 report](../.superpowers/sdd/2026-09-10-blue-jelly/task-6-report.md).

Two explicit caveats: full plugin-manager deactivate/reactivate needs a route remount before the pet appears again (`immediateReactivationVisible: false`); KV show/hide re-enable works immediately. The final PTY process required SIGKILL after shutdown grace periods, while explicit plugin cleanup had already passed. Normal-font visual acceptance remains outstanding. Task 3/4 static-mood commands above are historical evidence for their static builds; use the Task 6 commands for the current reactive entry.

## Task 8 — package usability and final acceptance (2026-09-10)

### Reproducible installation and build

The README now supplies exact source build, project-local relative-file, and global file-URL instructions. The current usable config is **`tui.json` in this package root**, containing only `$schema: https://opencode.ai/tui.json` and `plugin: ["./dist/index.js"]`. No conflicting root config existed when it was added. Restart OpenCode from this folder to load it. No real global config was edited.

Re-inspected the published TUI schema's `plugin`/`plugin_enabled` fields and the pinned [TUI loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/config/tui.ts). Confirmed global → explicit override → project → discovered config-directory precedence, declaration-relative plugin resolution, string/file-URL specs, and the separate server/TUI schemas. Native `--installation local` discovers the actual root `tui.json`; `--installation global` loads a file URL from **isolated** `$XDG_CONFIG_HOME/opencode/tui.json`, with project discovery disabled. Both load the same built entry through OpenCode 1.18.30.

The package stays private/unpublished, version `0.1.0`, with `exports["./tui"] = "./dist/index.js"`. The runtime package allowlist is `dist/index.js`, README, character workflow, and this evidence file (plus mandatory package.json). Artwork is compiled into the entry; there are no external runtime art files. `scripts/verify-package.ts` packs/extracts the archive, checks the exact five-file inventory, entry byte identity, art metafile inputs, and the three external runtime imports. Generated sessions/keys, test fixtures, local config, dependencies, and metafile are excluded. Source-copy instructions are distinct from runtime-archive instructions.

Final main-tree commands:

```sh
bun install --frozen-lockfile
bun test
python3 -m unittest discover -s tests -p '*_test.py'
bun run typecheck
bun run build
python3 scripts/smoke-native.py --activity --installation local
bun scripts/verify-activity.ts
python3 scripts/smoke-native.py --preferences --installation global
python3 scripts/smoke-native.py --preferences --restart --installation global
bun scripts/verify-package.ts
```

Unit/build results: **114 Bun tests, 0 failures, 73,158 assertions**; **2 Python cleanup tests, OK**; typecheck success; **41,240-byte entry**; only `@opentui/solid`, `solid-js`, and `@opentui/core` runtime imports. Host runtime bundling remains prohibited. All artwork/defaults remain approved Jelly-only in the main tree.

### Bounded fixes, with regression evidence

1. **Demo opener:** a failed platform opener on a reused session used to reject initial publication before watchers were installed. The real spawned CLI regression failed with `Watcher exited before ready`; now opening is best-effort after successful publication, reports the error/manual URL, and live edits continue. Six demo lifecycle tests pass, including subsequent revision publication after opener exit 7.
2. **Smoke cleanup:** unconditional `killpg` and a single timed wait could fail for an already exited server or a server ignoring SIGTERM. A proxy shutdown error also skipped resource closure/artifacts. The cleanup helper independently attempts proxy shutdown/close, process termination/reaping, and log close; records cleanup errors in proxy/process evidence; escalates to SIGKILL on timeout; and tolerates process-exit races. Tests exercise a real SIGTERM-ignoring child and a shutdown exception with an already reaped server, checking artifacts and resource closure. PTY launch failure also cleans its started proxy.
3. **Immediate plugin-manager reactivation: fixed for the observed 1.18.30 failure.** The native assertion first failed while the registry already held the correct new slot IDs, the plugin was active, one layout observer existed, and slot errors were empty. Inspection of installed OpenTUI `index.bun.js:1343–1355` found its subscriber sets a version **synchronously on the first notification**, suppressing further notifications until the queued microtask merely resets its guard. The footer's empty registry-context probe was that first notification; subsequent visible registrations in the same microtask were not sampled by mounted slots. A single `await Promise.resolve()` after footer decoration lets that notification drain before visible slot registration, followed by an aborted-lifecycle guard. No host patch, private API, route remount, or extra timer is used.

The strengthened native regression now deactivates/reactivates on the **existing session prompt, existing sidebar, and Home**, capturing correct pixels immediately before any route workaround. Each deactivate removes the layout observer; reactivation restores exactly one. `immediateReactivationVisible` is now **true**. Historical Task 6/7 false values remain valid records of the older build. For those older builds, activate → Home → original session (or restart) is the precise workaround; full unload/route navigation does not have the `/pet` draft-retention guarantee.

### Current installed-host matrix (zero model calls)

| Check | Fresh observed evidence | Scope |
| --- | --- | --- |
| Home / pre-submit | `home`, `return-home` | Actual native prompt perch |
| First submission transition | `baseline`, `thinking` after empty-session creation/navigation and synthetic user/busy SSE | Zero-call surrogate; actual submit-to-provider path deliberately unrun |
| Wide sidebar | `baseline`, `paused-resize-restored` at 160 × 50 | One pet above delegated original footer |
| Hidden sidebar | `paused-narrow`, `moving-perch` | Prompt perch; static mood preserved through transfer |
| Manually opened narrow sidebar | `manual-narrow-sidebar` / `manual-narrow-hidden` at 110 × 50 | Public host toggle; independent pixel verification |
| Very small height/width | `small-height.json` at 110 × 22; 28 × 18 assertion | Zero pet, then restored at 160 × 50 |
| Permission / question | `permission`, `child-question`, `deferred-error` | Real host request panels driven by synthetic SSE; waiting fallback |
| Thinking / tools | `thinking`, `tools`, `evicted-user-tools`, `thinking-again` | Shared original-art pixel comparison |
| Done once | `completion`, `completion-expired`, historical-baseline checks | Deadline clears; no navigation/re-enable replay |
| Abort / error / retry | interrupt/expiry, error/retry/recovery and duplicate captures | No abort celebration; duplicate effects suppressed |
| Session switch | `other-session`, `return-baseline` | No background/historical hop |
| Disabled motion | Paused activity captures; preferences host animation override | Zero interval while paused; one shared 10 Hz clock when enabled |
| Hide / re-enable | Activity baseline and native `/pet` settings | Immediate, one pet; command available while hidden |
| Settings / draft | 27 configure observations | Real PTY slash/palette/menus, multiline draft/editor identity/focus retained |
| Settings after restart | 5 restart observations in a distinct process | Hidden/bare/paused persisted in isolated KV before fixture writes |
| Full unload/reactivate | Three new immediate captures | Prompt/sidebar/Home now render without remount |
| Cleanup | Deadline/interval/layout observer assertions | Explicit production plugin disposal passes |

Activity result: **35 captures**, **15,948 independently verified pixel halves**, **10 ticks/second**, no duplicate/clipped sprite pixels in audited screens, zero slot errors, zero enabled providers, zero persisted messages. Proxy audit permits only three empty-session creation POSTs and records three deletions. Preferences phases have **zero POSTs**. No provider/model calls are made. Layout interaction and retention evidence from Task 4 remains historical for its more exhaustive attachment/tall-draft scenarios; it is not relabeled as a fresh Task 8 run.

**Shutdown distinction:** the final activity PTY again exits **-9 (SIGKILL)** after UI/TERM grace periods, while the local server exits **-15**. Plugin disposal assertions had already passed. This proves bounded harness process removal and explicit plugin resource cleanup, **not** graceful production TUI shutdown. Proxy/process `cleanupErrors` are empty on final successful runs.

### Fresh-copy A/B/C proof

`bun scripts/prepare-acceptance.ts` creates a temporary source copy through an explicit allowlist, without node_modules, dist, local config, or `.superpowers` sessions; it writes a fresh project-only `tui.json`. In that copy, `bun install --frozen-lockfile` installed 134 packages, and tests/typecheck/build succeeded. The exact temporary roots and command output are in `task-8-report.md`.

The actual installed Superpowers companion was launched in that copy with `bun run demo -- --open --superpowers-dir <resolved installed brainstorming directory>`. The original preview/session was not reused or changed. An added `src/art/sprout.ts` and catalog registration hot-reloaded into a new screen; **Test sprout**, **Green**, **Gold**, and compatible **None** appeared. Browser checks covered all seven moods, exactly one placement pet in each of four layouts, 400 ms scrubbing, hop/settle/replay/no second hop, and unchanged reduced-motion pixels. Recorded events included `character:sprout`, `skin:gold`, `character:jelly`, `hat:none`, and `hat:lavender-bucket`.

The same temporary catalog was built and loaded natively: `/pet → Character → Test sprout → Skin → Gold` changed preferences immediately with one pet and retained draft/editor/focus; Jelly remained selectable. **34 configure observations and 5 restart observations**, zero POSTs. No second character is added to production. The temporary watcher was terminated and its companion stopped using the supported `--stop` command, which returned `{"status":"stopped"}`.

One initial fresh-copy full-suite run hit a 5-second watcher-test metadata gate timeout (113 pass / 1 fail). The immediate focused six-test lifecycle run and full 114-test rerun passed; the real companion's source reload also passed. No root cause for that isolated test flake was established, and it is not silently treated as a fixed production bug.

### Remaining visual / execution acceptance

The user's normal-font/normal-size visual check is still required before approving another creature. Browser sizing and captured PTY half-pixels do not establish physical glyph appearance. Real model submission, actual permission/tool execution, clipboard-image decoding, and OS drag/drop are deliberately unrun. The zero-call first-turn surrogate is identified above rather than claimed as a real submission. See [character workflow](character-workflow.md) for the tested example, accessory/clearance contract, and native review loop.
