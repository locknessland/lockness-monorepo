/**
 * Content Processing Middleware
 *
 * Provides content manipulation features:
 * - Compress (Response compression)
 * - ETag (Entity Tag for caching)
 * - Pretty JSON (Formatted JSON responses)
 * - Trailing Slash (URL normalization)
 *
 * @module
 */

export * from 'hono/compress'
export * from 'hono/etag'
export * from 'hono/pretty-json'
export * from 'hono/trailing-slash'
