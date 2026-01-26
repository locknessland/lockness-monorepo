import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type { AppConfig, Module, ModuleWithMiddleware } from '../types.ts'

/**
 * Manages the mounting of the application on a URL pattern prefix.
 * Implements the dual-layer routing strategy for i18n and similar use cases.
 */
export class MountManager {
    constructor(
        private readonly rootHono: Hono<Env, Schema, string>,
        private readonly internalHono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Sets up mount point by connecting rootHono to internalHono.
     * If no mount point is defined, only mounts at root `/`.
     */
    setup(config: Module | ModuleWithMiddleware | AppConfig): void {
        const mountPoint = 'mountPoint' in config
            ? config.mountPoint
            : undefined

        // Always mount at root FIRST - this ensures routes like /demo/mount-points
        // are matched before the mount point pattern /:langId/:countryId
        this.rootHono.route('/', this.internalHono)

        if (mountPoint) {
            // Apply mount-specific middleware if provided
            if (mountPoint.middleware) {
                this.rootHono.use(
                    `${mountPoint.pattern}/*`,
                    mountPoint.middleware,
                )
            }

            // Route requests under this pattern to internal hono
            this.rootHono.route(mountPoint.pattern, this.internalHono)
        }
    }
}
