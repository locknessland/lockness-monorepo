/**
 * @fileoverview Hono's automatic JSX dev runtime, the module
 * `jsx: react-jsxdev` imports from `@lockness/hono/jsx-dev-runtime`.
 *
 * Homed here so the JSX runtime stays behind the pinned Hono boundary on every
 * runtime (plan 274 FR-007). `@lockness/core` does not re-export this subpath
 * yet; it gains `./jsx-dev-runtime` with the switch to `react-jsx` (T031).
 *
 * @example
 * ```typescript
 * import { jsxDEV } from '@lockness/hono/jsx-dev-runtime'
 *
 * String(jsxDEV('p', { children: 'hi' })) // '<p>hi</p>'
 * ```
 *
 * @module
 */

export { Fragment, jsxDEV } from 'hono/jsx/jsx-dev-runtime'
export type { JSX } from 'hono/jsx/jsx-dev-runtime'
