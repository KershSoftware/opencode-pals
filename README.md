# OpenCode Pals

A native pixel companion for **OpenCode 1.18.30**. The default is the approved sky-blue jelly wearing a lavender bucket hat; choose **None** for the complete bare jelly. It follows the viewed session, with thinking, tool-work, waiting, completion, error/retry, and interruption expressions.

The accepted three-quarter candidate is **14 terminal columns × 13 visible source pixels** (seven occupied terminal rows). Its animation union is `{x:2,y:2,width:14,height:14}`, with a 14×16 crop, nine-row perch, eight-row prompt reservation, and an additional one-row sidebar margin. The demo hero and placements share the same production sprite and pose; original art appears only in separately labeled comparison previews.

## Quickstart: install globally

Prerequisites: OpenCode **1.18.30**, Bun **1.3.13**, and a true-color terminal with half-block glyphs. Bash and Node are also needed for the optional Superpowers browser demo; Python 3 is needed for native acceptance scripts.

Fresh checkout:

```sh
git clone https://github.com/KershSoftware/opencode-pals.git
cd opencode-pals
bun install --frozen-lockfile
bun run build
bun run install:global
```

Expected versions are `1.18.30` and `1.3.13`. Do not update global Bun to resolve the upstream Solid peer-version warning. This build intentionally matches OpenCode's patched Solid **1.9.10** and OpenTUI **0.4.5**. The host supplies those runtime imports; loading the compiled entry with ordinary Node/Bun is not a native installation test.

Quit and restart OpenCode **from any project**, type `/pals`, select **Pals settings**, and press Enter. No API key or model request is needed. The installer copies the standalone build to **`~/.config/opencode/pals/index.js`**, or **`$XDG_CONFIG_HOME/opencode/pals/index.js`** when XDG is set. You can move or delete the checkout after installation; OpenCode loads the copy.

The helper adds the exact, space-safe file URL to your global **TUI** config. It reads and validates both `tui.json` and `tui.jsonc` because OpenCode 1.18.30 loads both, JSON first and JSONC second. An existing matching entry (including its options) is retained; otherwise it appends to JSONC if present, else JSON, creating JSON only when neither exists. If a later empty plugin array masks only Pals, the helper adds that entry with its options to the later array too. If making an empty override nonempty would revive suppressed unrelated plugins, installation refuses before writing and asks you to resolve the override. Comments, other settings, and unrelated plugin options are preserved; edited array formatting may change. Running install again updates the copied build without adding another entry.

This is a **TUI plugin**: do not put it in `opencode.json`'s server-plugin array or auto-discovered server-plugin directories. The built-in `opencode plugin <module> --global` command has no uninstall counterpart in 1.18.30, so this private, unpublished package uses its own narrow setup helper.

### Update

From an updated source checkout:

```sh
bun install --frozen-lockfile
bun run build
bun run install:global
```

Quit and restart OpenCode to load the new copy. Your Pals preferences are retained.

### Uninstall

From this checkout (or another copy with dependencies installed):

```sh
bun run uninstall:global
```

Then quit and restart OpenCode. Uninstall needs no build. It removes only the exact managed Pals file-URL entry from both global TUI config files, the copied `index.js`, and the helper's ownership manifest. The manifest remembers original empty overrides across repeated installs. Uninstall checks both files together: it removes cleared keys when safe, or retains `[]` when needed to keep nested `tui.plugin` entries shadowed, while restoring genuine original empty overrides. If these effects conflict with preserving unrelated lower-file plugins, it rejects before any writes and asks you to resolve the precedence conflict. Install also verifies that a safe owned-entry-only uninstall is possible before writing. Comments inside removed entries/properties remain in the config. The `pals/` directory is removed only if setup created it and it is empty; a pre-existing directory keeps its permissions and identity. Other plugins, settings, files, and saved Pals preferences remain. Repeating uninstall is safe. Older v1 markers retain their directories and use the same effective-plugin checks when clearing their registrations.

The helper refuses malformed JSON/JSONC, invalid plugin arrays, duplicate JSON keys, unmarked existing `pals/index.js`, and symlinks at managed paths before writing. `XDG_CONFIG_HOME` must be absolute when set. Use the same HOME/XDG scope for install and uninstall. Project configs and `OPENCODE_TUI_CONFIG` / `OPENCODE_CONFIG_DIR` overrides are separate and are not edited.

```sh
bun run install:global --help
bun run uninstall:global --help
# From another working directory; quote paths containing spaces:
bun "/path/to/opencode-pals/scripts/global-setup.ts" uninstall
```

**Still seeing Pals inside the clone after global uninstall?** The checked-in `./tui.json` independently loads `./dist/index.js` for development. Remove that entry from the clone's `plugin` array to disable that local installation, then restart. Likewise, any older manually installed file URL is a separate entry: remove it from its declaring config when switching to the managed global install. Use one Pals installation scope to avoid competing copies.

## One-off native character trial

From a source checkout with dependencies installed:

```sh
bun run try:pal -- ./tests/fixtures/trial-character.ts
bun run try:pal -- "./path with spaces/my-character.ts"
# Build without taking over an interactive terminal:
bun run try:pal -- ./tests/fixtures/trial-character.ts --prepare
bun run try:pal --help
```

Default-export a typed `Character`, or `{ character, hats? }` satisfying `PalTrial` from `scripts/native-trial.ts`. The helper validates the art, bundles a separate entry with the production Solid transform/host externalization, and launches **your installed OpenCode** with inherited interactive stdio. Use `--binary "/path/to/opencode"` to override PATH discovery (then `~/.opencode/bin/opencode` fallback). No publish or global install is needed; this development helper requires the source checkout.

This is **temporary visual mode with no model providers**: its own HOME, XDG directories, cwd, TUI config and preferences. The candidate starts selected in a generated in-memory catalog. `/pals` changes character/skin/hat; **`/pals-trial` → Pals trial mood** forces any of seven expressions and offers **View home** / **View sidebar (empty local session)**. These are native menu actions, not model prompts. The forced mood is trial-only. `/pals` Pause gives a static expression; transient moods stay selected for inspection.

Quit to remove the interactive trial; Ctrl-C/SIGTERM forward to the child with a five-second shutdown limit. Quit and rerun after source edits. `--prepare` (alias `--build-only`) persists a build under ignored `.superpowers/native-trial/` and prints JSON containing `entry`, `config`, `tuiConfig`, `cwd`, `environment`, and a shell-quoted `cleanup` command. It also saves `trial.json` in that directory. Production catalog files, normal OpenCode config and real preferences are not edited. Trial modules are trusted executable local code; validation checks their shape and sampled draw output, not arbitrary side effects.

See [the native trial contract and smoke workflow](docs/character-workflow.md#one-off-native-trials) for exact types, examples and automated capture.

Preparation keeps candidate import/draw diagnostics on stderr, including direct stdout writes, using a validation subprocess and separate metadata IPC. Stdout contains success JSON only after validation exits successfully; candidate failures produce diagnostics and a nonzero exit without success JSON. This isolates output, not the trusted module's filesystem/environment privileges.

## Optional: checkout-local development

Building and launching `opencode` inside this clone activates its checked-in **`tui.json`** without global installation. For another local-only project, merge a build path into that project's TUI config:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./dist/index.js"]
}
```

This relative example is exact when the config is beside `dist/`. Paths resolve relative to the declaring config. Local installation points at the checkout and stops working if the referenced build moves or is deleted. The runtime archive excludes this local config; use its global helper instead, or create a local config explicitly.

**Quit and restart OpenCode after initial installation, changing plugin config, or rebuilding the plugin.** From this folder, launch `opencode`, then open `/pals`. The current OpenCode session keeps its already-loaded code. Pals settings changes apply immediately after loading.

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

## Agent skill discovery

Start with [AGENTS.md](AGENTS.md) for project orientation and current development commands. In OpenCode, prefer loading these repository skills by name; other agents can read the linked files directly:

- [pals-create-character](.opencode/skills/pals-create-character/SKILL.md): create or revise characters, skins, and hats.
- [pals-try-native](.opencode/skills/pals-try-native/SKILL.md): inspect a one-off character in an isolated native trial.
- [pals-global-setup](.opencode/skills/pals-global-setup/SKILL.md): install, update, or uninstall Pals globally from source or a prebuilt archive.

These are source-checkout authoring references, covered by the fresh-source copy audit. The runtime package does not need them; global setup installs the TUI artifact, not skills. Quit/restart OpenCode to discover newly added skills.

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
python3 scripts/smoke-native.py --preferences --installation managed-global
```

Run native scripts sequentially. They launch isolated local servers/PTYs, disable all providers, reject model submission endpoints, and save evidence beneath `.superpowers/native-smoke/`. They do not operate on your normal sessions. `--installation local` tests existing project `tui.json` discovery; `--installation global` tests a file URL in isolated global configuration. `--entry /path/to/package/dist/index.js` selects an existing artifact in default explicit mode or global mode. Combining `--entry` with local mode is rejected before any configuration writes or process launches; use global/explicit mode to test a selected archive artifact.

`--preferences --installation managed-global` creates a fresh temporary HOME/XDG and a package path containing spaces, runs the real global installer twice, deletes that installing package, then opens `/pals` through the native PTY from an unrelated working directory. It runs uninstall twice afterward and verifies unrelated config/plugin preservation. This mode prints its temporary evidence path and cannot be combined with `--entry` or `--restart`.

Normal tests/build and demo generation use only checked-in sources, including the preserved original oracle in `tests/fixtures/approved-v9.js`. The live demo additionally requires the actual Superpowers install above. Optional `bun scripts/verify-three-quarter-preview.ts` discovers Chromium on PATH; set `PALS_CHROMIUM_EXECUTABLE="/path/to/chromium"` to override. `bun scripts/verify-companion-recovery.ts` accepts `SUPERPOWERS_DIR` and uses the system temporary directory. Native capture visualizers require newly generated evidence; historical half-size/hat-spacing generators are disabled.

The local package is private and unpublished. `exports["./tui"]` points to `dist/index.js`; all runtime artwork is compiled into that file. After building, `bun pm pack --destination "/path/to/output-directory"` creates a local archive. Its allowlist includes the built entry, `scripts/global-setup.ts`, and user docs, excluding generated sessions, keys, fixtures, local config, build metafile, and dependencies. After extraction, run `bun install --production` and `bun run install:global` from the extracted package; its build is already included. The helper uses `jsonc-parser`; the installed TUI artifact only needs OpenCode's host runtime. The source archive audit exercises these packed install/uninstall commands. Use the source tree with `bun.lock`, `src/`, `demo/`, and `scripts/` for rebuilding and live art editing.

See [integration evidence](docs/integration-evidence.md) for version-pinned API references, measured sizes, historical versus current checks, and final acceptance results. **Please check the jelly in your normal terminal font and size before adding another character.**
