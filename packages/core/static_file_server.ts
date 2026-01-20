/**
 * @fileoverview Static File Server Module
 *
 * Manages static file serving configuration for the application.
 * Handles registration of static file middleware with Hono.
 *
 * @module @lockness/core/static_file_server
 */

import type { Hono } from 'hono'
import { denoServeStatic as serveStatic } from 'hono'

/**
 * Manages static file serving configuration for the application.
 *
 * Wraps Hono's `serveStatic` middleware for serving files from a directory.
 * Typically used to serve assets from a `public/` folder.
 *
 * @example
 * ```typescript
 * const server = new StaticFileServer()
 *
 * // Serve all files from public/
 * server.register(hono, '/*', 'public')
 *
 * // Or use conditional registration
 * server.registerIfConfigured(hono, config.staticDir)
 * ```
 */
export class StaticFileServer {
    /**
     * Registers static file serving with Hono.
     *
     * @param hono - The Hono application instance
     * @param pathPattern - URL path pattern to match (default: '/*')
     * @param rootDir - Root directory for static files (default: 'public')
     *
     * @example
     * ```typescript
     * server.register(hono, '/*', 'public')
     * // Requests to /css/app.css will serve public/css/app.css
     * ```
     *
     * @remarks
     * Static files should be registered AFTER routes but BEFORE notFound handler
     * to ensure proper priority: routes → static files → 404
     */
    register(
        hono: Hono,
        pathPattern: string = '/*',
        rootDir: string = 'public',
    ): void {
        hono.use(pathPattern, serveStatic({ root: rootDir }))
    }

    /**
     * Registers static files if a directory is configured.
     *
     * Convenience method that only registers if `staticDir` is defined.
     *
     * @param hono - The Hono application instance
     * @param staticDir - Optional static directory path
     *
     * @example
     * ```typescript
     * // Only registers if staticDir is provided
     * server.registerIfConfigured(hono, config.staticDir)
     * ```
     */
    registerIfConfigured(hono: Hono, staticDir?: string): void {
        if (staticDir) {
            this.register(hono, '/*', staticDir)
        }
    }
}
