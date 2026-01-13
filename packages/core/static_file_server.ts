import type { Hono } from 'hono'
import { serveStatic } from 'hono/deno'

/**
 * Manages static file serving configuration for the application.
 * Handles registration of static file middleware with Hono.
 */
export class StaticFileServer {
    /**
     * Register static file serving with Hono
     *
     * @param hono - The Hono application instance
     * @param pathPattern - URL path pattern to match (default: '/*')
     * @param rootDir - Root directory for static files (default: 'public')
     *
     * @example
     * const server = new StaticFileServer()
     * server.register(hono, '/*', 'public')
     *
     * @remarks
     * Static files should be registered AFTER routes but BEFORE notFound handler
     * to ensure proper priority: routes -> static files -> 404
     */
    register(
        hono: Hono,
        pathPattern: string = '/*',
        rootDir: string = 'public',
    ): void {
        hono.use(pathPattern, serveStatic({ root: rootDir }))
    }

    /**
     * Register static files if a directory is configured
     *
     * @param hono - The Hono application instance
     * @param staticDir - Optional static directory path
     *
     * @example
     * const server = new StaticFileServer()
     * server.registerIfConfigured(hono, 'public')
     */
    registerIfConfigured(hono: Hono, staticDir?: string): void {
        if (staticDir) {
            this.register(hono, '/*', staticDir)
        }
    }
}
