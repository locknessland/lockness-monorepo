/**
 * @fileoverview Hono's Node adapter: the HTTP server, static files, the peer address and
 * the WebSocket upgrade, assembled from Hono's two Node packages.
 *
 * Hono ships no Node adapter in its core package; `@hono/node-server` and
 * `@hono/node-ws` are npm-only, which hard rule #2 allows for a package with
 * no JSR build. Re-exporting them here keeps them behind the pinned boundary:
 * no other package names them (plan 274 §5).
 *
 * Runtime-specific by design, so it is a subpath and never part of the root
 * barrel. Only `packages/runtime/` imports this module, as the one place that
 * chooses a runtime (plan 274 FR-002).
 *
 * @example
 * ```typescript
 * import { createNodeWebSocket, serve } from '@lockness/hono/node'
 *
 * const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
 * app.get('/ws', upgradeWebSocket(() => ({ onMessage: (e, ws) => ws.send(String(e.data)) })))
 * injectWebSocket(serve({ fetch: app.fetch, port: 3000 }))
 * ```
 *
 * @module
 */

export {
    createAdaptorServer,
    getRequestListener,
    RequestError,
    serve,
} from '@hono/node-server'
export type { Http2Bindings, HttpBindings, ServerType } from '@hono/node-server'
export { serveStatic } from '@hono/node-server/serve-static'
export { getConnInfo } from '@hono/node-server/conninfo'
export { createNodeWebSocket } from '@hono/node-ws'
export type { NodeWebSocket, NodeWebSocketInit } from '@hono/node-ws'
