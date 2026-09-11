# OpenCode Pals

Native TUI pixel companions for OpenCode **1.18.30**, using Bun **1.3.13**. Start with `README.md`; art contracts and preview guidance live in `docs/character-workflow.md`.

## Task references

Prefer OpenCode's native skill loader by name. Other agents can read the corresponding file directly:

| Skill | Path | Use |
| --- | --- | --- |
| `pals-create-character` | `.opencode/skills/pals-create-character/SKILL.md` | Character, skin, and hat authoring/review |
| `pals-try-native` | `.opencode/skills/pals-try-native/SKILL.md` | Isolated one-off native character trials |
| `pals-global-setup` | `.opencode/skills/pals-global-setup/SKILL.md` | Global install, update, and uninstall |

## Source development

Run from the repository root:

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun scripts/verify-fresh-checkout.ts
```

Preview commands:

```sh
bun run demo -- --open --superpowers-dir "/path/to/superpowers"
bun run demo -- --events
bun run demo -- --stop
bun run try:pal -- ./tests/fixtures/trial-character.ts
bun run try:pal -- ./tests/fixtures/trial-character.ts --prepare
```

Browser preview requires the actual Superpowers installation (plus Bash/Node); see `docs/character-workflow.md` for demo options. Native interactive trials require the installed host; preparation is build-only. Use `bun run try:pal --help` for trial options. Preserve uncommitted artwork and keep candidate drafts separate until approved for `src/art/catalog.ts`.

## Source versus production

The source checkout provides authoring skills, `src/`, `demo/`, build/trial scripts, and the lockfile. Its checked-in `tui.json` locally loads `dist/index.js`. The fresh-source audit copies source into a disposable environment and exercises tests, build, demo generation, and packed install/uninstall under isolated HOME/XDG.

The prebuilt runtime archive includes `dist/index.js` and the global helper: use `bun install --production`, then `bun run install:global`. It is not the authoring checkout; use source for rebuilding and previews. OpenCode supplies the artifact's runtime imports. Global setup copies the artifact independently of the clone; it does not install authoring skills globally. The package is private/unpublished; publish only on explicit request.

Quit and restart OpenCode after plugin/config/skill changes to load them.
