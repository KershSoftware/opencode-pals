// Fresh source copy; deliberately never copies dependencies, dist, configs or sessions.
import { cp, mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const source = resolve(import.meta.dir, '..')
const root = await realpath(await mkdtemp(join(tmpdir(), 'pals-acceptance-')))
for (const name of ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'README.md', 'src', 'demo', 'scripts', 'tests', 'docs']) {
  await cp(join(source, name), join(root, name), { recursive: true,
    filter: path => !path.includes('__pycache__') })
}
await Bun.write(join(root, 'tui.json'), JSON.stringify({ $schema: 'https://opencode.ai/tui.json', plugin: ['./dist/index.js'] }, null, 2))
console.log(JSON.stringify({ root, copiedDependencies: false, copiedBuild: false, copiedSessions: false }))
