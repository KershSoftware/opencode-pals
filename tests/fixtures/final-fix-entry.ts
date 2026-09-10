// Build-only acceptance catalog: production entry, animator, perches and menus.
import plugin from '../../src/tui/index'
import { catalog } from '../../src/art/catalog'
import { finalFixCatalog } from './final-fix-catalog'
catalog.characters.push(...finalFixCatalog.characters.slice(1))
export default plugin
