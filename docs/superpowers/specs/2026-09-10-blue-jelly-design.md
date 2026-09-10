# OpenCode Pals — Jelly design record

## Current requirement amendment — final Pals rebrand (2026-09-10)

This amendment supersedes the historical requirements and approval gates below.
The accepted production candidate is `three-quarter14cols`: 14 columns × 13
visible source pixels (seven occupied terminal rows), animation union
`{x:2,y:2,width:14,height:14}`, 14×16 crop, nine-row perch, eight-row prompt
reservation, and one additional sidebar margin row. Do not restore the rejected
nine-column half-size candidate or the original 18-column production size.
The demo hero and all placements share the selected production art and pose;
original reference art is a separately labeled comparison. The independent v9
draw oracle is checked in at `tests/fixtures/approved-v9.js`.

The product/package/plugin ID is `opencode-pals`, the primary command is `/pals`,
and the palette category/title is **Pals → Pals settings**. Preferences use
`opencode-pals.preferences.v1`; import `jelly-pet.preferences.v1` only when the new
data is unavailable after hydration (the host treats null and absence identically),
then persist the normalized result once. Available non-nullish Pals data wins;
valid choices are preserved. Jelly
remains the base character and its hat remains a separate accessory.

The user authorized final rebrand/readiness work with cross-machine visual
verification as follow-up. Earlier visual/rebrand/push gates below are historical.
Repository operations remain subject to the controller's current authorization.
Use README instructions for current clone, install, demo and verification commands.

## Status and goal

The user approved the visual direction and the expanded A/B/C design on
September 10, 2026. This document records the approved scope and native terminal
integration approach.

Build an extensible reactive pixel-pet plugin for OpenCode's terminal interface,
targeting the installed version, 1.18.30. Ship the jelly first, with its base form
and separate accessories, and prove its appearance, placement, and response to
real agent activity before designing additional creatures.

The user's additional requirements are:

A. Reproduce the Superpowers live-demo workflow from this project so adding and
   refining new characters is straightforward.
B. Offer the bare jelly as a base character and hats as separate alternatives;
   support additional characters and alternative skins.
C. Make installation and in-OpenCode enable/disable, character selection, and
   alternative-skin selection easy, with persistent preferences.

## Approved visual reference

The final browser study is:

`.superpowers/brainstorm/89862-1789010902/content/blue-jelly-brim-v9.html`

Extract its sprite drawing into a renderer-independent pixel-frame generator.
The preview is a design reference; it is not the plugin implementation.

- Compact, asymmetric sky-blue jelly with stepped side bumps.
- Flat blue palette, darker outline, small rectangular eyes, tiny line mouth.
- Optional low lavender bucket hat with a darker ribbon and cream stitch.
- Continuous dark underside to the brim, including its center.
- One visible blue pixel row between the brim and working eyebrows.
- No inward head squish or changing head silhouette.
- Body, hat, and face move together during whole-body motion.
- Thinking uses eye movement and blinking; the body and hat remain still.

Preserve the approved 24 × 24 coordinate system and colors. Transparent canvas
margins are not visible art: crop unused margins consistently across all frames,
including hop frames, when sizing and aligning the terminal component. Alignment
must follow the visible sprite, not the original canvas's transparent left edge.

## Character, accessory, and skin model

Separate three choices:

- **Character:** a creature's silhouette, facial geometry, and animation frames.
- **Skin:** a named palette/style preset belonging to a character.
- **Hat:** an optional accessory composed at that character's attachment point.

Initial content is `jelly` with `sky-blue` as its default skin, and hat choices
`none` and `lavender-bucket`. The earlier beret and baseball-cap studies were not
approved and are not initial catalog entries. Additional skin and character
definitions use the same interfaces; new artwork can be reviewed in the demo.

Default first-run selection is the approved sky-blue jelly with the lavender
bucket hat. Choosing `none` exposes the complete bare-jelly artwork, including
the part of the head hidden by the hat. The UI displays a single skin as the
current value and avoids presenting an empty or misleading skin picker.

Use a small typed catalog, not hardcoded branches in the plugin entry. Each
character definition provides:

- Stable ID and display name.
- Pixel-frame generation for the standard mood vocabulary.
- Named semantic palette entries and supported skin IDs.
- Fixed frame bounds across animations and explicit visible-art alignment bounds.
- Accessory anchor, compositing layer, compatible hat IDs, and face-clearance rules.
- Default skin and hat, with `none` always supported.

Each hat supplies an ID, display name, pixel layer, and compatibility metadata.
The composer positions it from the character's anchor and shared pose transform.
The bucket hat's continuous brim and blue gap above working eyebrows are required
for all jelly frames and skins. Palette-only skins must preserve legible contrast.

On character change, restore that character's previously selected compatible
skin/hat when possible; otherwise use its defaults. Unknown saved character IDs
fall back to jelly. Removed or incompatible skins/hats fall back to the selected
character's defaults and update the saved selection. Do not leave the pet blank.

## Reproducible Superpowers live demo (A)

Provide a supported project command, `bun run demo -- --open`, and a documented
Superpowers companion prerequisite. Accept an explicit `--superpowers-dir` or
`SUPERPOWERS_DIR` override; discover an installed skill where possible. Do not
embed this machine's cache path in project scripts.

The command adapts the installed Superpowers visual companion rather than
reimplementing its protocol:

1. Locate and validate the companion's `scripts/start-server.sh`.
2. Launch it with this project root as `--project-dir` and forward `--open`.
3. Parse its startup JSON and use its returned screen/state directories and full
   session-key URL. Verify the server is live before publishing a screen.
4. Generate the interactive pet study from the shared catalog and frame generator.
5. Watch shared asset/demo sources and publish a uniquely named screen per
   revision, keeping previous revisions available for comparison.
6. Surface the companion's recorded selection events for the coding agent to read;
   conversation feedback remains authoritative.
7. Support restarting the same project session and stopping the companion using
   its supported scripts. Document both operations.

If Superpowers is absent, explain the prerequisite and the explicit path option.
Do not silently swap to an unrelated preview server and call it the same workflow.

The demo must reproduce the controls and views used in this design session:

- Enlarged sprite view and smaller placement view.
- Character, skin, and hat controls populated from the actual catalog.
- Every mood, including replayable one-shot completion.
- Home input perch, sidebar-open view, sidebar-hidden view, and waiting fallback.
- A manual deterministic time/frame control for checking pixel boundaries.
- Reduced-motion behavior and animation enable/disable.

The browser canvas and terminal view consume the same composed pixel frames and
animation timeline. There must not be a separately handwritten browser jelly that
can diverge from the shipped sprite. Browser backgrounds and terminal controls
remain clearly labeled layout studies; live OpenCode checks validate integration.

Keep the demo template, generator, and example content in versioned project files.
Generated sessions, helper logs, and session keys live under ignored
`.superpowers/`. Preserve a stable approved-jelly reference/fixture outside that
ignored directory when implementation begins. Document the exact edit → publish →
view → read feedback → revise → verify in OpenCode loop in `docs/character-workflow.md`.

## In-OpenCode controls (C)

Register a `/pet` entry and a **Pet** command-palette category through the public
TUI keymap API. `/pet` opens a keyboard-friendly menu offering:

- Show / hide pet.
- Choose character.
- Choose skin for the current character.
- Choose hat, including **None**.
- Animate / pause pet.
- Reset appearance to defaults.

Choices apply immediately without restarting OpenCode and show the current value.
Use host dialog/select components and return focus to the existing prompt when
closing. Preserve the current draft and do not submit a model prompt to configure
the pet. A character/skin/hat change must update both possible perches immediately.

Show/hide is a plugin setting: hiding removes the rendered pet and stops its
animation work while keeping `/pet` available to enable it again. Re-enabling
reconciles current session state without replaying old completion events. Respect
both the pet animation setting and the host's global animation-disabled preference.

Persist a versioned object in the public host KV under a namespaced key such as
`jelly-pet.preferences.v1`: enabled, animate, selected character, and per-character
skin/hat preferences. Load defaults on first use and validate persisted IDs.
Preferences are shared across sessions in the same host KV scope.

Installation documentation must provide one verified package/local installation
path, build prerequisites, restart instructions for initial plugin loading, and
the `/pet` command. Initial validation uses project-local configuration; global
installation is documented after the same build has been verified.

## Placement

Only one pet is visible per OpenCode terminal instance, associated with the viewed
session rather than every session producing events.

| Situation | Position |
| --- | --- |
| Home / before first submission | Input box's top-right edge |
| Active conversation with sidebar visible | Sidebar footer, above the project path, aligned to the left content margin |
| Active conversation with sidebar hidden | Input box's top-right edge |
| Sidebar hidden and input replaced by a permission/question panel | Waiting perch near the prompt area, clear of the panel's text and controls |

The input pet nestles slightly into the input background. Target one sprite-pixel
row of overlap, restricted to the input's existing blank top padding. Reserve
space above the input for the rest of the sprite, including the completion hop.
Do not cover editable text, attachment labels, autocomplete, or model controls.

When resizing or toggling the sidebar, transfer the existing pet's animation
state to the new location without restarting completion or duplicating it.
No cross-screen travel animation is needed.

If a very small viewport cannot fit the pet and interactive controls, hide the
pet until space returns. A dialog must retain visual and keyboard priority.

## Moods and transitions

| State | Appearance | Timing |
| --- | --- | --- |
| Idle | Steady body, line mouth, occasional blink | Approximately 140 ms blink per 4.9 seconds |
| Thinking / generating | Level eyes glance one pixel sideways and return to center; line mouth | 4.8-second cycle: center to 1.1 s, aside to 3 s, then center; blink at 3.65–3.79 s |
| Working | Focused eyebrows, small whole-body bob | One sprite pixel of vertical travel; approximately 2.5-second cycle |
| Waiting for user | Attentive eyes, mostly still | Holds until the request is resolved |
| Finished | Happy eyes and one hop | Up to three sprite pixels over 0.9 s; idle after 1.4 s |
| Error / retry | Brief startle then concerned expression | One-pixel recoil for 0.25 s; concern until recovery or a new turn |
| Interrupted | Calm reset | Returns to idle within 0.65 s; never celebrates an abort |

Waiting retains the existing preview expression for the first implementation.
The user's rejection of the “o” mouth concerned the thinking expression; thinking
must use the line mouth.

Use actual session lifecycle information, not the model's prose, to select moods:

1. Outstanding permission or question displayed for the viewed session → waiting.
2. Confirmed abort → interrupted; terminal failure or retry status → concerned.
3. One or more active tools in the current turn → working.
4. Busy session with no active tools → thinking, including text generation.
5. Observed successful turn completion → finished once.
6. Otherwise → idle.

Completion requires an observed live turn and a successful terminal outcome.
An idle event alone must not trigger a hop on startup, history loading, tool
completion, or session navigation. Unknown terminal outcomes settle to idle.
Track the completed turn identity so duplicate events cannot replay the hop.

Map tool activity by tool-part identity so concurrent calls are handled correctly.
Pending requests surfaced from child sessions should count as waiting when the
parent session UI is displaying them. Background activity unrelated to the viewed
session must not replace its mood.

Apply a 250 ms settling interval to routine thinking/working transitions to avoid
rapid flicker. Waiting, interruption, and terminal errors bypass this delay.
Clear obsolete transient state and timers when switching sessions.

## Integration approach

### Chosen direction: native TUI plugin

Use TypeScript, Solid, OpenTUI, and the `@opencode-ai/plugin/tui` surface matching
OpenCode 1.18.30. Keep one package in this workspace, provisionally named
`opencode-jelly-pet`.

The native plugin is preferred because it shares the host's layout, themes,
reactive session state, lifecycle, and event bus. A terminal image-protocol overlay
would complicate redraw and terminal compatibility; a custom OpenCode build would
increase installation and update maintenance. Those are not needed for the first
approach.

### Verified host evidence

Source references are pinned to `anomalyco/opencode` tag `v1.18.30`:

- `packages/plugin/src/tui.ts`: public plugin API, state, events, renderer, slots,
  prompt component, and lifecycle cleanup.
- `packages/tui/src/routes/home.tsx`: `home_prompt` replacement slot, prompt ref,
  and `home_prompt_right` slot.
- `packages/tui/src/routes/session/index.tsx`: `session_prompt` replacement slot,
  prompt props, responsive sidebar, and conditional permission/question panels.
- `packages/tui/src/routes/session/sidebar.tsx`: fixed footer area and
  `sidebar_footer` single-winner slot.
- `packages/tui/src/feature-plugins/sidebar/footer.tsx`: built-in project path and
  version footer, registered with order 100.
- `packages/tui/src/component/prompt/index.tsx`: one row of top padding, editor
  behavior, ref cleanup, and host `animations_enabled` preference.

These sources establish available hooks; they do not yet prove the full layout
composition or successful installation of an external plugin.

### Layout adapter

Use the home/session prompt slots to compose the pet perch with the public
`api.ui.Prompt`. Forward the ref, visibility, disabled state, session ID, submit
callback, and nested right-hand slots. Keep the prompt mounted when only pet
visibility changes so draft text, focus, and editor state remain stable.

The sidebar footer is single-winner and already has a built-in plugin. First
validate whether its slot machinery supports wrapping/decorating the existing
winner. Prefer composition that preserves the built-in footer. If decoration is
unavailable, use a narrowly scoped footer adapter reproducing the public
path/version display and verify its behavior explicitly. Do not silently displace
an unrelated custom footer.

Determine sidebar availability from a mounted, visible sidebar anchor, rather
than copying only the host's width threshold. The host also permits a manually
opened narrow-screen sidebar. Track actual layout visibility and clean up anchors
on unmount.

For permission/question states without a mounted prompt or sidebar, use the public
app-level slot and renderer layout information for the waiting perch. Its position
must be verified against the live panel. If the public API cannot place it without
covering controls, stop and resolve that integration constraint with the user
before choosing a different placement.

### Renderer

Generate palette-indexed pixel frames independently of OpenTUI. Encode pairs of
vertical pixels using foreground/background-colored half-block characters. Use
the correct surrounding theme background for transparent halves, including the
portion nested into the prompt. Do not write raw ANSI output alongside the host.

Start at one terminal column per sprite pixel and two sprite rows per terminal
row. Browser sizing is illustrative: validate physical size and font aspect ratio
in the user's terminal before calling the render faithful.

Use one shared animation clock, at most 10 updates per second, and redraw only
when the visible frame changes. Honor the host's animation-disabled setting with
static expressions. Dispose clocks, subscriptions, and anchors when deactivated.

### Small implementation units

- Character catalog and composer: base frames, skin palettes, hat layers, anchors.
- Sprite generator: geometry, mood-specific faces, and shared animation timeline.
- Terminal encoder/view: half-block output, backgrounds, and layout bounds.
- Session adapter: translate public state/events into normalized activity.
- Mood controller: priority, smoothing, transients, completion deduplication.
- Placement adapter: one active perch and stable prompt/footer composition.
- Settings/menu: host dialogs, persistent preferences, and immediate updates.
- Demo adapter: Superpowers launcher, shared preview template, and revision output.
- Plugin entry: register adapters, shared lifecycle, and host integration.

Keep the catalog local and typed. Additional characters, hats, and skins should
require asset definitions and registration, not edits to mood control, placement,
or the settings UI.

## Verification and rollout

Implement in this order:

1. Establish the shared jelly/hat assets and reproducible Superpowers demo, then a
   minimal local plugin that loads in OpenCode 1.18.30 and renders the approved
   static sprite in the actual terminal.
2. Prove slot composition, draft/focus preservation, two-home placement, and the
   waiting fallback before adding all reactive moods.
3. Connect session state, animations, and persistent `/pet` controls, then exercise
   real session transitions and catalog selection.

Meaningful automated checks cover:

- Half-block colors, transparency, bounds, and the continuous brim/eyebrow gap.
- Concurrent tool calls, reordered/duplicate events, request priority, and aborts.
- Successful completion once per live turn; no hop on history load or navigation.
- Thinking timing, motion-disabled frames, and cleanup of timers/subscriptions.
- Exactly one selected perch across sidebar mounting, resize, and session changes.
- Complete bare-jelly frames, optional hat compositing, and valid skin/hat fallback.
- Browser/terminal parity from the same composed frame input.
- Preference round trips, menu changes, show/hide/re-enable, and motion settings.
- Demo launcher parsing, missing prerequisites, revision naming, and source reload.

Live terminal checks cover:

- Home, first submission, wide sidebar, manual sidebar toggle, and narrow width.
- Multiline input, typing, pasted attachments, autocomplete, and retained drafts.
- Waiting requests with and without sidebar, completion, interruption, and errors.
- No text overlap; left-aligned sidebar art; nested prompt edge; readable face.
- `/pet` operation without model calls, saved choices after restart, and no lost
  draft after changing appearance or toggling visibility.
- Launch the documented Superpowers demo from a fresh checkout using an explicit
  skill path, edit an asset, observe a fresh screen, and read a recorded selection.
- Register a temporary test-only second character/skin fixture and confirm the
  demo and `/pet` pickers discover it without controller or UI modifications.

Use an isolated project-local installation for initial validation. Inspect the
version-matched TUI configuration schema and loader before writing installation
configuration. Document the verified package/build/install commands in the README.
After a config-time installation change, quit and restart OpenCode to load it.

## Review checkpoint

The expanded design is approved, including the reproducible Superpowers workflow,
independent character/skin/hat choices, in-OpenCode controls, and waiting-state
perch. The implementation plan is `../plans/2026-09-10-blue-jelly.md`. The layout
feasibility checks above are an early milestone; do not treat the browser preview
as evidence that native integration is complete.
