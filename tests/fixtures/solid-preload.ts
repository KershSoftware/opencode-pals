import { mock } from 'bun:test'
// Resolve the actual client runtime before the store imports solid-js. Bun's
// default SSR entry intentionally does not subscribe to reactive changes.
// @ts-expect-error Solid's explicit runtime path has no declaration mapping.
const solid = await import('solid-js/dist/solid.js')
mock.module('solid-js', () => solid)
// @ts-expect-error Solid's explicit runtime path has no declaration mapping.
const store = await import('solid-js/store/dist/store.js')
mock.module('solid-js/store', () => store)
