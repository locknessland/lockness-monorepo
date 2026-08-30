/**
 * Security Middleware
 *
 * Provides security features including:
 * - CORS (Cross-Origin Resource Sharing)
 * - CSRF (Cross-Site Request Forgery protection)
 * - Secure Headers (Security-related HTTP headers)
 * - IP Restriction (IP-based access control)
 * - Rate limiting (request throttling)
 *
 * @module
 */

export * from 'hono/cors'
export * from 'hono/csrf'
export * from 'hono/secure-headers'
export * from 'hono/ip-restriction'

// `hono-rate-limiter` is not published on JSR (jsr.io returns 404 for every
// candidate scope), so an `npm:` specifier is the only way to reach it. It is
// pinned here, in the single package allowed to depend on Hono's ecosystem
// directly, so the rest of the workspace keeps importing it through
// `@lockness/core` like every other Hono API.
export {
    MemoryStore as ThrottleMemoryStore,
    rateLimiter,
} from 'hono-rate-limiter'
export type {
    ConfigType as RateLimiterConfig,
    Store as ThrottleStore,
} from 'hono-rate-limiter'
