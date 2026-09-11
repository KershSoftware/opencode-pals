---
name: pals-create-character
description: Use when creating or revising a Pals pixel character, sprite, skin, or optional hat in this repository, or reviewing candidate artwork before catalog approval.
---

# Create a Pals character

Keep one shared art implementation. Paths below are repository-root relative.

## Source map

| Contract | Source |
| --- | --- |
| Production catalog | `src/art/catalog.ts`: `catalog`; `referenceCatalog` preserves full-size references |
| Character, Pose, Skin, Hat | `src/art/types.ts` |
| Production body/accessory | `src/art/compact.ts`: `compactJelly`, `compactBucket` |
| Skin palettes / no-hat | `src/art/jelly.ts`: `jelly.skins`; `src/art/hats.ts`: `none` |
| Composition / motion | `src/art/compose.ts`, `src/art/timeline.ts` |
| Terminal crop/reservation | `src/tui/placement.ts`: `perchGeometry`, `perchFrame` |

`Character` requires `id`, `name`, `skins`, compatible `hats` IDs, `defaults: {skin, hat}`, `anchor: {x,y}`, `bounds: {x,y,width,height}`, and `draw(pose, skin): Frame`. Skin is `{id,name,palette: Record<string,string>}`.

Exact `Pose`: `{dy: number, eyeDx: number, blink: boolean, mood: Mood}`. Moods: `idle`, `thinking`, `working`, `waiting`, `done`, `error`, `interrupted`.

Return fresh 24×24 frames (576 opaque `#rrggbb`/`null` pixels); use `src/art/raster.ts`, no art timers. Bounds are the fixed animation-plus-compatible-hats union, never per-frame. Terminal cells pair two vertical pixels; geometry adds blank clearance. Preserve face/brim clearance and editable/request space.

Accessories are separate optional `Hat` objects: `{id,name,draw(pose,anchor): Frame}`. Composer overlays hats after body/face. Apply matching motion once per layer; retain `none` and valid defaults.

## Draft → review

Adapt the [complete runnable trial](../../../tests/fixtures/trial-character.ts); default-export `Character` or `{character,hats?}` (`PalTrial` in `scripts/native-trial.ts`). Prefer an isolated draft/source copy; register there for browser review, and update the shipped catalog only after approval.

From that checkout (Bun 1.3.13; installed Superpowers; native host OpenCode 1.18.30):

```sh
bun run demo -- --open --superpowers-dir "/path/to/superpowers"
bun run demo -- --events
bun run try:pal -- ./tests/fixtures/trial-character.ts
```

Substitute the installed package root and candidate module. Use the printed authenticated browser URL. Review every mood/skin/compatible hat (including none), Pause/Replay/Time, reduced motion, and Before first prompt/Sidebar open/Sidebar hidden/Waiting panel layouts. Hero and native-placement preview must use the same production catalog/composer art. Finish watching with Ctrl-C, then `bun run demo -- --stop`.

Browser parity is not real-terminal proof. Follow [pals-try-native](../pals-try-native/SKILL.md); see also [native trials](../../../docs/character-workflow.md#one-off-native-trials). Generic native smoke verifies selection/menu/geometry; arbitrary-sprite pixel correctness requires a candidate-specific oracle.
