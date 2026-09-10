import { jelly } from './jelly'
import { lavenderBucket, none } from './hats'
import type { Catalog } from './types'
import { compactJelly, compactBucket } from './compact'

// Full approved art remains executable source reference and fixture-verified.
export const referenceCatalog: Catalog = { characters: [jelly], hats: [none, lavenderBucket] }
export const catalog: Catalog = { characters: [compactJelly], hats: [none, compactBucket] }
