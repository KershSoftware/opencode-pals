import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, cp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'jsonc-parser'

// Exercises the emitted Node executable without source files or dependencies.
test('bundled Node CLI installs and updates an independent artifact, preserving JSONC on uninstall', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pals node cli '))
  try {
    const build = Bun.spawn([process.execPath, 'run', 'build'], { cwd: resolve(import.meta.dir, '..'), stdout: 'pipe', stderr: 'pipe' })
    expect(await build.exited).toBe(0)
    const dist = join(root, 'package/dist'), config = join(root, 'config/opencode')
    await mkdir(dist, { recursive: true }); await mkdir(config, { recursive: true })
    await cp(resolve(import.meta.dir, '../dist/cli.js'), join(dist, 'cli.js'))
    await writeFile(join(root, 'package/package.json'), '{"type":"module"}')
    await writeFile(join(dist, 'index.js'), 'first artifact')
    const file = join(config, 'tui.jsonc')
    await writeFile(file, '{ // keep comment\n "theme":"custom", "plugin":[["unrelated", {"enabled":false}]],\n}')
    const run = async (...args: string[]) => {
      const child = Bun.spawn(['node', join(dist, 'cli.js'), ...args], { cwd: root,
        env: { PATH: process.env.PATH, HOME: root, XDG_CONFIG_HOME: join(root, 'config') }, stdout: 'pipe', stderr: 'pipe' })
      const out = await new Response(child.stdout).text(), err = await new Response(child.stderr).text()
      return { code: await child.exited, out, err }
    }
    expect((await run('--help')).out).toContain('opencode-pals install')
    expect((await run('bogus')).code).toBe(1)
    expect((await run('install')).code).toBe(0)
    await writeFile(join(dist, 'index.js'), 'updated artifact')
    expect((await run('install')).code).toBe(0)
    expect(await readFile(join(config, 'pals/index.js'), 'utf8')).toBe('updated artifact')
    await rm(join(dist, 'index.js'))
    expect(await readFile(join(config, 'pals/index.js'), 'utf8')).toBe('updated artifact')
    expect((await run('uninstall')).code).toBe(0)
    expect((await run('uninstall')).code).toBe(0)
    const text = await readFile(file, 'utf8')
    expect(text).toContain('// keep comment')
    expect(parse(text)).toEqual({ theme: 'custom', plugin: [['unrelated', { enabled: false }]] })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
