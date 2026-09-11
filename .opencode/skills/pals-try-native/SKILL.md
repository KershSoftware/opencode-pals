---
name: pals-try-native
description: Use when trying a one-off Pals character in actual OpenCode outside the browser, preparing a native trial bundle, or inspecting candidate moods and home/sidebar placement.
---

# Try a Pal natively

Paths/commands are repository-root relative. Use a source checkout with dependencies installed (`bun install --frozen-lockfile`), Bun **1.3.13**, OpenCode **1.18.30**, and a true-color terminal with half-block glyphs. Preparation needs no installed host.

## Candidate and command

Keep drafts under `./scratch/`; preserve production catalog, global settings/preferences, and uncommitted art. Default-export `Character` from `src/art/types.ts`, or `{character, hats?}` satisfying `PalTrial` from `scripts/native-trial.ts`. Use filesystem imports; keep draft-relative imports correct.

Contract: valid IDs, skins/palettes, compatible hats/defaults, integer anchor/bounds within 24×24; `draw` returns 576 opaque `#rrggbb`/`null` pixels. Bounds cover animation/accessory union. See [complete runnable candidate](../../../tests/fixtures/trial-character.ts):

```sh
bun run try:pal -- ./tests/fixtures/trial-character.ts
```

Substitute `./scratch/my-character.ts`. Quote spaced paths. `--binary "/path/to/opencode"` overrides PATH discovery (then `~/.opencode/bin/opencode` fallback). `bun run try:pal --help` lists flags.

## Inspect or prepare

| Mode | Result |
| --- | --- |
| Default | Installed OpenCode, interactive stdio; candidate preselected |
| Append `--prepare` or `--build-only` | Build only; persistent `.superpowers/native-trial/` artifacts |

Preparation stdout is success JSON: `directory`, `entry`, `config`, `tuiConfig`, `cwd`, `environment`, and `cleanup` (also saved in `directory/trial.json`). Worker import/draw diagnostics go to stderr; failed validation exits nonzero without success JSON. Use exact reported paths, never guessed latest directories.

`/pals` selects skins/hats or Pause. `/pals-trial` → **Pals trial mood** selects idle/thinking/working/waiting/done/error/interrupted, **View home**, or **View sidebar (empty local session)**. Waiting forces expression, not permission-panel layout.

This is isolated HOME/XDG/cwd/config/preferences, no providers, temporary visual mode—not live coding. Candidate code is trusted executable code; validation is sampling, not a sandbox. Source edits require quit/rerun; no hot reload.

## Cleanup and evidence

Quit deletes interactive artifacts. Ctrl-C/SIGTERM forwards to the child with a five-second shutdown limit. Prepared artifacts persist; after review, run the exact printed shell-quoted `cleanup` command. SIGKILL prevents automatic cleanup: use saved metadata. Preserve unrelated trials/drafts.

Generic smoke checks selection/menu/geometry; arbitrary-candidate pixel correctness requires a candidate-specific oracle. [Native contract and smoke reference](../../../docs/character-workflow.md#one-off-native-trials).
