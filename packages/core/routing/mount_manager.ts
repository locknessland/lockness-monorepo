import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type { AppConfig, Module, ModuleWithMiddleware } from '../types.ts'

/**
 * Manages the mounting of the application on different URL patterns.
 * Implements the multi-mount routing strategy.
 */
export class MountManager {
    constructor(
        private readonly rootHono: Hono<Env, Schema, string>,
        private readonly internalHono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Sets up mount points by connecting rootHono to hono.
     * If no mount points are defined, mounts at root `/`.
     */
    setup(config: Module | ModuleWithMiddleware | AppConfig): void {
        const mountPoints = 'mountPoints' in config
            ? config.mountPoints
            : undefined

        // Always mount at root FIRST - this ensures routes like /demo/mount-points
        // are matched before the mount point pattern /:langId/:countryId
        this.rootHono.route('/', this.internalHono)

        if (mountPoints && mountPoints.length > 0) {
            // Mount points add middleware to specific patterns
            // Routes remain accessible at root AND under mount point patterns
            for (const mount of mountPoints) {
                // Apply mount-specific middleware if provided
                if (mount.middleware) {
                    this.rootHono.use(`${mount.pattern}/*`, mount.middleware)
                }

                // Route requests under this pattern to internal hono
                this.rootHono.route(mount.pattern, this.internalHono)
            }
        }
    }
}
