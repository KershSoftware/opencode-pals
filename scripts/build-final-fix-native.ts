import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin'
const result = await Bun.build({ entrypoints: ['tests/fixtures/final-fix-entry.ts'],
  outdir: '.superpowers/native-smoke/final-fix', target: 'bun', format: 'esm',
  plugins: [createSolidTransformPlugin()], external: ['solid-js', 'solid-js/*', '@opentui/*', '@opencode-ai/*'] })
if (!result.success) throw new AggregateError(result.logs, 'Review native fixture build failed')
console.log(`Built test-only catalog entry: ${result.outputs[0]!.path}`)
