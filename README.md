# OpenCode Pals

A native pixel companion for **OpenCode 1.18.30**. The default is the approved sky-blue jelly wearing a lavender bucket hat; choose **None** for the complete bare jelly. It follows the viewed session, with thinking, tool-work, waiting, completion, error/retry, and interruption expressions.

The accepted three-quarter candidate is **14 terminal columns × 13 visible source pixels** (seven occupied terminal rows). Its animation union is `{x:2,y:2,width:14,height:14}`, with a 14×16 crop, nine-row perch, eight-row prompt reservation, and an additional one-row sidebar margin. The demo hero and placements share the same production sprite and pose; original art appears only in separately labeled comparison previews.

## Build and install locally

Prerequisites: OpenCode **1.18.30**, Bun **1.3.13**, and a true-color terminal with half-block glyphs. Bash and Node are also needed for the optional Superpowers browser demo; Python 3 is needed for native acceptance scripts.

Fresh checkout:

```sh
git clone https://github.com/KershSoftware/opencode-pals.git
cd opencode-pals
bun install --frozen-lockfile
bun run build
opencode
```

Expected versions are `1.18.30` and `1.3.13`. Do not update global Bun to resolve the upstream Solid peer-version warning. This build intentionally matches OpenCode's patched Solid **1.9.10** and OpenTUI **0.4.5**. The host supplies those runtime imports; loading the compiled entry with ordinary Node/Bun is not a native installation test.

Create **`tui.json` in the project where you launch OpenCode** (merge into an existing `plugin` array if present):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./dist/index.js"]
}
```

This relative example is exact when launching from the folder containing `dist/`. In the development workspace, a runnable config is already present at `./tui.json`. The runtime archive does **not** include `tui.json`: after extraction, create it using the example above, or merge the plugin entry into your existing project config. For a different project, use the absolute file URL described below, or a relative path from that project's `tui.json` to this build. Paths resolve relative to the declaring config, not your shell's previous directory.

**Quit and restart OpenCode after initial installation, changing plugin config, or rebuilding the plugin.** From this folder, launch `opencode`, then open `/pals`. The current OpenCode session keeps its already-loaded code. Pals settings changes apply immediately after loading.

This is a **TUI plugin**: do not put it in `opencode.json`'s server-plugin array or auto-discovered server-plugin directories. No API key or model request is needed to open `/pals`.

## Global installation from the same local build

Keep the built package at a stable location. In that package folder, obtain the exact URL (including correct escaping for spaces):

```sh
bun -e 'console.log(require("node:url").pathToFileURL(require("node:path").resolve("dist/index.js")).href)'
```

Manually merge that output into **`~/.config/opencode/tui.json`** (or `$XDG_CONFIG_HOME/opencode/tui.json` when using a custom XDG config directory):

```json
{
  "$schema": "https://opencode.ai/tui.json",
    "plugin": ["file:///absolute/path/to/opencode-pals/dist/index.js"]
}
```

Preserve existing settings/plugins. Then quit and restart OpenCode. Use one installation scope for Pals; remove the local entry if switching to global. Moving/deleting the build breaks its file URL. Global discovery is tested with an isolated XDG directory; no real global user config is written by this project or its acceptance scripts.

## `/pals` quick reference

Type `/pals`, select **Pals settings**, and press Enter. Or open the command palette and select **Pals → Pals settings**. These are host menus, not prompts sent to a model.

| Action | Result |
| --- | --- |
| Show / Hide Pal | Immediate; hiding stops animation work and leaves `/pals` available |
| Choose character | Catalog-derived choices; remembers each character's skin/hat |
| Choose skin | Current character's skins; Jelly currently has Sky blue only |
| Choose hat → None | Bare jelly; Lavender bucket restores the accessory |
| Animate / Pause | Static expression when paused; host animation-disabled setting also wins |
| Reset appearance | Restores current character's default skin/hat; keeps visibility/motion |
| Escape | Close menu and return to the prompt |

Preferences persist in host KV at `opencode-pals.preferences.v1`, shared within that KV scope. After host hydration, existing `jelly-pet.preferences.v1` choices migrate once when no new saved data is available. The host getter treats null and absence identically; either may import legacy choices. Available non-nullish Pals data takes precedence (valid choices are preserved; invalid values/removed IDs normalize to compatible defaults). The normalized result is saved under the Pals key, preventing repeated migration, and the legacy key remains untouched. Ordinary show/hide and appearance changes preserve the existing prompt draft, editor, and focus. The old slash command is replaced by `/pals`.

## Placement and known limits

- Home: input top-right. Session with visible sidebar: above its original path/version footer, left aligned. Hidden sidebar: input top-right. Permission/question replacing the input: a measured, normal-flow waiting perch below the session.
- One Pal per terminal. Insufficient space or an open dialog hides it. The waiting reservation gives the real request controls priority. Cross-machine font/size verification is follow-up.
- Footers are composed through the public registry with the original renderer retained. A competing custom footer makes the wrapper yield and the Pal use the prompt; removing the competitor needs reactivation/restart to restore the sidebar wrapper.
- **Plugin-manager deactivate/reactivate is different from `/pals` Hide/Show.** Registration notifications are separated with a microtask on 1.18.30. Stash/copy any unsent draft before full plugin unload; draft retention is proven for `/pals`, not full host unload.
- Synthetic events test actual installed-host rendering without providers. Real model/tool execution and OS clipboard-image/drop paths are outside this zero-model-call acceptance. Controlled PTY shutdown can need SIGKILL even after explicit timer/observer cleanup passes.

## Live character workflow

```sh
# Optional: clone the actual Superpowers companion outside this repository.
git clone https://github.com/obra/superpowers.git "$HOME/superpowers"
bun run demo -- --open --superpowers-dir "$HOME/superpowers"
```

See [character-workflow.md](docs/character-workflow.md) for a working second-character/two-skin example, accessory rules, live editing, deterministic mood checks, and event feedback.

## Acceptance and package contents

```sh
bun test
bun run typecheck
bun scripts/verify-fresh-checkout.ts
python3 -m unittest discover -s tests -p '*_test.py'
python3 scripts/smoke-native.py --activity
bun scripts/verify-activity.ts
python3 scripts/smoke-native.py --preferences
python3 scripts/smoke-native.py --preferences --restart
```

Run native scripts sequentially. They launch isolated local servers/PTYs, disable all providers, reject model submission endpoints, and save evidence beneath `.superpowers/native-smoke/`. They do not operate on your normal sessions. `--installation local` tests existing project `tui.json` discovery; `--installation global` tests a file URL in isolated global configuration. `--entry /path/to/package/dist/index.js` selects an existing artifact in default explicit mode or global mode. Combining `--entry` with local mode is rejected before any configuration writes or process launches; use global/explicit mode to test a selected archive artifact.

Normal tests/build and demo generation use only checked-in sources, including the preserved original oracle in `tests/fixtures/approved-v9.js`. The live demo additionally requires the actual Superpowers install above. Optional `bun scripts/verify-three-quarter-preview.ts` discovers Chromium on PATH; set `PALS_CHROMIUM_EXECUTABLE="/path/to/chromium"` to override. `bun scripts/verify-companion-recovery.ts` accepts `SUPERPOWERS_DIR` and uses the system temporary directory. Native capture visualizers require newly generated evidence; historical half-size/hat-spacing generators are disabled.

The local package is private and unpublished. `exports["./tui"]` points to `dist/index.js`; all runtime artwork is compiled into that file. After building, `bun pm pack --destination "/path/to/output-directory"` creates a local archive. Its allowlist includes the built entry and user docs, excluding generated sessions, keys, fixtures, local config, build metafile, and dependencies. Extract it and reference its `dist/index.js` through the same TUI file-URL installation. The archive is runtime-only; use the source tree with `bun.lock`, `src/`, `demo/`, and `scripts/` for live art editing.

See [integration evidence](docs/integration-evidence.md) for version-pinned API references, measured sizes, historical versus current checks, and final acceptance results. **Please check the jelly in your normal terminal font and size before adding another character.**
