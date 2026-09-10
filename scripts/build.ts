import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'

const result = await Bun.build({
  entrypoints: ['src/tui/index.tsx'],
  outdir: 'dist',
  target: 'bun',
  format: 'esm',
  plugins: [createSolidTransformPlugin()],
  external: ['solid-js', 'solid-js/*', '@opentui/*', '@opencode-ai/*'],
  metafile: true,
})
if (!result.success) throw new AggregateError(result.logs, 'TUI build failed')
const meta = result.metafile!
const bundledHost = Object.keys(meta.inputs).filter(path => /node_modules\/(solid-js|@opentui|@opencode-ai)\//.test(path))
if (bundledHost.length) throw new Error(`Bundled host runtimes: ${bundledHost.join(', ')}`)
await Bun.write('dist/metafile.json', JSON.stringify(meta, null, 2))
console.log(`Built ${result.outputs.map(output => `${output.path} (${output.size} bytes)`).join(', ')}`)
console.log('Externalization verified: no Solid/OpenTUI/OpenCode inputs bundled')
const imports = new Bun.Transpiler({ loader: 'js' }).scanImports(await result.outputs[0]!.text())
console.log(`Emitted runtime imports: ${[...new Set(imports.map(item => item.path))].join(', ')}`)
