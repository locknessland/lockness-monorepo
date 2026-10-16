/**
 * @fileoverview Hono's Bun adapter: static files read through `Bun.file`, the peer address
 * from `server.requestIP`, and the WebSocket upgrade over `Bun.serve`.
 *
 * Runtime-specific by design, so it is a subpath and never part of the root
 * barrel: importing `@lockness/hono` must not pin a runtime. Only
 * `packages/runtime/` imports this module, as the one place that chooses a
 * runtime (plan 274 FR-002); everything else asks `@lockness/runtime`.
 *
 * @example
 * ```typescript
 * import { getConnInfo, serveStatic } from '@lockness/hono/bun'
 *
 * app.use('/static/*', serveStatic({ root: './public' }))
 * app.get('/ip', (c) => c.text(getConnInfo(c).remote.address ?? 'unknown'))
 * ```
 *
 * @module
 */

export * from 'hono/bun'
