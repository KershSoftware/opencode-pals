---
name: pals-global-setup
description: Use when installing, updating, or uninstalling OpenCode Pals globally from a source checkout or extracted runtime archive, or when Pals remains active after global uninstall.
---

# Pals global setup

Requires Bun **1.3.13**, OpenCode **1.18.30**, and a true-color terminal with half-block glyphs. Run commands from the checkout/extracted package root.

## Commands

Fresh source checkout:

```sh
git clone https://github.com/KershSoftware/opencode-pals.git
cd opencode-pals
bun install --frozen-lockfile
bun run build
bun run install:global
```

Source update: update the checkout, then repeat dependency install, build, and `install:global`. The helper does not build automatically.

Extracted prebuilt runtime archive (includes `dist/index.js`):

```sh
bun install --production
bun run install:global
```

Uninstall from either package with dependencies installed:

```sh
bun run uninstall:global
```

Uninstall needs **no build**. From another cwd:
`bun "/path with spaces/opencode-pals/scripts/global-setup.ts" uninstall`.
Help: `bun run install:global --help` or `bun run uninstall:global --help`.

## Scope and preservation

Installation copies the standalone artifact to `$XDG_CONFIG_HOME/opencode/pals/index.js`, defaulting to `~/.config/opencode/pals/index.js` when XDG is unset/empty. Nonempty XDG must be absolute; use the same HOME/XDG scope for uninstall. The copy survives moving/deleting the clone.

The helper manages its exact file URL in global **TUI** `tui.json` and `tui.jsonc`, not server-plugin configuration. Both files are validated together; JSONC follows JSON. Existing entry options, comments, unrelated plugins/settings, and saved Pals preferences are preserved; edited formatting may change.

Ambiguous/shadowing precedence conflicts, malformed/duplicate-key configs, unowned artifacts, or managed-path symlinks are rejected **before mutation**. Resolve the reported conflict with the user; never blindly overwrite configs or bypass rejection. Uninstall removes the exact managed registration and marked artifacts, preserving required empty overrides/nested shadowing; only helper-created empty directories are removed.

Project configs and `OPENCODE_TUI_CONFIG` / `OPENCODE_CONFIG_DIR` overrides are separate. Checked-in `./tui.json` still activates `./dist/index.js` after global uninstall. Disable that local entry separately if requested. Legacy manual file URLs likewise belong to their declaring configs.

Quit/restart OpenCode after install/update/uninstall. After installation, verify `/pals` → **Pals settings** from an unrelated project. No npm publication unless explicitly requested.

See [setup reference](../../../docs/setup.md#quickstart-install-globally) for details.
