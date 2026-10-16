/**
 * @fileoverview Hono's Deno adapter: static files, the peer address `Deno.serve` passes as
 * `remoteAddr`, and the WebSocket upgrade.
 *
 * Runtime-specific by design, so it is a subpath and never part of the root
 * barrel: importing `@lockness/hono` must not pin a runtime. It is where
 * `denoServeStatic` (now `serveStatic`) and `getConnInfo` moved when they left
 * the barrel (plan 274 §5).
 *
 * @example
 * ```typescript
 * import { getConnInfo, serveStatic } from '@lockness/hono/deno'
 *
 * app.use('/static/*', serveStatic({ root: './public' }))
 * app.get('/ip', (c) => c.text(getConnInfo(c).remote.address ?? 'unknown'))
 * ```
 *
 * @module
 */

export * from 'hono/deno'
