/**
 * @lockness/hono - Hono bridge for Lockness framework
 *
 * Centralized Hono dependency management with all features available from a single import.
 *
 * @example Basic usage
 * ```typescript
 * import { Hono, basicAuth, cors, logger } from '@lockness/hono'
 *
 * const app = new Hono()
 * app.use('*', logger())
 * app.use('*', cors())
 * app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))
 * ```
 *
 * @module
 */

// ============================================================================
// Core Hono
// ============================================================================

export * from 'hono'

// ============================================================================
// Types & Utilities
// ============================================================================

/**
 * TypeScript types for Hono (Env, Input, Schema, etc.)
 */
export type { Env, Input, Schema, ToSchema, TypedResponse } from './types.ts'

/**
 * Hono RPC client for type-safe API calls
 * @example
 * ```typescript
 * import { hc } from '@lockness/hono'
 * const client = hc<AppType>('http://localhost:3000')
 * const res = await client.api.posts.$get()
 * ```
 */
export * from './client.ts'

/**
 * HTTP Exception class for throwing HTTP errors
 * @example
 * ```typescript
 * import { HTTPException } from '@lockness/hono'
 * throw new HTTPException(404, { message: 'Not found' })
 * ```
 */
export * from './http_exception.ts'

/**
 * Validator utilities for request validation
 */
export * from './validator.ts'

// ============================================================================
// JSX Support
// ============================================================================

/**
 * JSX types (Child, FC, PropsWithChildren)
 */
export type { Child, FC, PropsWithChildren } from './jsx.ts'

/**
 * JSX runtime for JSX/TSX support
 */
export * from './jsx_runtime.ts'

/**
 * JSX renderer middleware for server-side rendering
 * @example
 * ```typescript
 * import { jsxRenderer } from '@lockness/hono'
 *
 * app.use('*', jsxRenderer(({ children }) => (
 *   <html><body>{children}</body></html>
 * )))
 * ```
 */
export { jsxRenderer, useRequestContext } from './jsx_renderer.ts'

// ============================================================================
// Adapters & Core Helpers
// ============================================================================

/**
 * Deno-specific serveStatic (use this for static files in Deno)
 * @example
 * ```typescript
 * import { denoServeStatic } from '@lockness/hono'
 * app.use('/static/*', denoServeStatic({ root: './public' }))
 * ```
 */
export { serveStatic as denoServeStatic } from './deno.ts'

/**
 * HTML helper for raw HTML strings
 * @example
 * ```typescript
 * import { html } from '@lockness/hono'
 * app.get('/', (c) => c.html(html`<h1>Hello</h1>`))
 * ```
 */
export { html, raw } from './html.ts'

/**
 * Cookie utilities (get, set, delete cookies)
 * @example
 * ```typescript
 * import { getCookie, setCookie } from '@lockness/hono'
 *
 * const value = getCookie(c, 'session')
 * setCookie(c, 'session', 'abc123', { maxAge: 3600 })
 * ```
 */
export {
    deleteCookie,
    getCookie,
    getSignedCookie,
    setCookie,
    setSignedCookie,
} from './cookie.ts'

/**
 * CORS middleware (legacy export, prefer importing from main module)
 */
export { cors } from './cors.ts'

/**
 * Zod validator for request validation
 * @example
 * ```typescript
 * import { zValidator } from '@lockness/hono'
 * import { z } from 'zod'
 *
 * const schema = z.object({ name: z.string() })
 * app.post('/users', zValidator('json', schema), (c) => {
 *   const data = c.req.valid('json')
 *   return c.json(data)
 * })
 * ```
 */
export { zValidator } from './zod_validator.ts'

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * HTTP Basic Authentication middleware
 * @example
 * ```typescript
 * import { basicAuth } from '@lockness/hono'
 * app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))
 * ```
 */
export * from './auth.ts'

// ============================================================================
// Security Middleware
// ============================================================================

/**
 * Security middleware (CORS, CSRF, secure headers, IP restriction)
 * @example
 * ```typescript
 * import { cors, csrf, secureHeaders } from '@lockness/hono'
 *
 * app.use('*', secureHeaders())
 * app.use('*', cors({ origin: 'https://example.com' }))
 * app.use('*', csrf())
 * ```
 */
export * from './security.ts'

// ============================================================================
// Content Processing Middleware
// ============================================================================

/**
 * Content processing middleware (compress, etag, prettyJSON, trailingSlash)
 * @example
 * ```typescript
 * import { compress, etag, prettyJSON } from '@lockness/hono'
 *
 * app.use('*', compress())
 * app.use('*', etag())
 * app.use('*', prettyJSON())
 * ```
 */
export * from './content.ts'

// ============================================================================
// Request Handling Middleware
// ============================================================================

/**
 * Request handling middleware (logger, bodyLimit, requestId, etc.)
 * @example
 * ```typescript
 * import { logger, bodyLimit, requestId } from '@lockness/hono'
 *
 * app.use('*', logger())
 * app.use('*', requestId())
 * app.use('*', bodyLimit({ maxSize: 50 * 1024 }))
 * ```
 */
export * from './request.ts'

// ============================================================================
// Timing & Caching Middleware
// ============================================================================

/**
 * Timing and caching middleware (timeout, timing, cache)
 * @example
 * ```typescript
 * import { timeout, timing, cache } from '@lockness/hono'
 *
 * app.use('/api/*', timeout(5000))
 * app.use('*', timing())
 * ```
 */
export * from './timing.ts'

// ============================================================================
// Routing Middleware
// ============================================================================

/**
 * Routing utilities (methodOverride, serveStatic)
 * @example
 * ```typescript
 * import { methodOverride, serveStatic } from '@lockness/hono'
 *
 * app.use('*', methodOverride())
 * app.use('/static/*', serveStatic({ root: './public' }))
 * ```
 */
export { methodOverride, serveStatic } from './routing.ts'

// ============================================================================
// Rendering Helpers
// ============================================================================

/**
 * Rendering helpers (CSS, SSG, streaming)
 * @example
 * ```typescript
 * import { css, ssgParams, streamText } from '@lockness/hono'
 *
 * // SSG for static site generation
 * app.get('/posts/:id', ssgParams(() => [{ id: '1' }, { id: '2' }]), (c) => {
 *   return c.html(<h1>Post {c.req.param('id')}</h1>)
 * })
 * ```
 */
export { css, ssgParams, streamSSE, streamText } from './rendering.ts'

// ============================================================================
// Client & Testing Helpers
// ============================================================================

/**
 * Testing utilities for Hono apps
 * @example
 * ```typescript
 * import { testClient } from '@lockness/hono'
 *
 * const client = testClient(app)
 * const res = await client.index.$get()
 * ```
 */
export * from './client.ts'

// ============================================================================
// Server Helpers
// ============================================================================

/**
 * Server utilities (runtime detection)
 * @example
 * ```typescript
 * import { getRuntimeKey } from '@lockness/hono'
 * const runtime = getRuntimeKey() // 'deno', 'bun', 'node', etc.
 * ```
 */
export { getRuntimeKey } from './server.ts'

// ============================================================================
// Network Helpers (Types)
// ============================================================================

/**
 * Network-related types (ConnInfo, WebSocket types)
 */
export type {
    AddressType,
    ConnInfo,
    GetConnInfo,
    UpgradeWebSocket,
    WSContext,
    WSReadyState,
} from './network.ts'
