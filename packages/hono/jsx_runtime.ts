/// <reference types="hono/jsx" />
/**
 * Hono's JSX runtime, the module the compiler imports from
 * `@lockness/hono/jsx-runtime`.
 *
 * The target is the automatic runtime alone (`jsx`, `jsxs`, `Fragment`), one
 * JSX mode on every runtime (plan 274 FR-007). `jsxTemplate`, `jsxAttr` and
 * `jsxEscape` are the `jsx: precompile` helpers: the workspace still compiles
 * in that mode, so they stay until the switch to `react-jsx` (T031) removes
 * the last config that emits them.
 *
 * @example
 * ```typescript
 * import { jsx } from '@lockness/hono/jsx-runtime'
 *
 * String(jsx('p', { children: 'hi' })) // '<p>hi</p>'
 * ```
 *
 * @module
 */

export { Fragment, jsx, jsxs } from 'hono/jsx/jsx-runtime'
export type { JSX } from 'hono/jsx/jsx-runtime'

// `jsx: precompile` helpers — removed with the last precompile config (T031).
export { jsxAttr, jsxEscape, jsxTemplate } from 'hono/jsx/jsx-runtime'
