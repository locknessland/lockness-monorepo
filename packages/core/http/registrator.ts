import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type { MiddlewareResolver } from './resolver.ts'
import type {
    AppConfig,
    MiddlewareInput,
    Module,
    ModuleWithMiddleware,
} from '../types.ts'

/**
 * Handles registration and application of middlewares.
 */
export class MiddlewareRegistrator {
    constructor(
        private readonly resolver: MiddlewareResolver,
        private readonly hono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Orchestrates the discovery, registration, and application of middlewares.
     */
    async register(
        config: Module | ModuleWithMiddleware | AppConfig,
        pendingGlobalMiddlewares: MiddlewareInput[],
    ): Promise<void> {
        // Step 0: Discover middlewares decorated with @DeclareMiddleware
        await this.discoverMiddlewares(config)

        // Step 1: Register named middlewares
        this.registerNamedMiddlewares(config)

        // Step 3: Resolve global middlewares
        const globalMiddlewares = this.resolveGlobalMiddlewares(
            config,
            pendingGlobalMiddlewares,
        )

        // Step 4: Apply global middlewares
        this.applyGlobalMiddlewares(globalMiddlewares)
    }

    /**
     * Discover middlewares decorated with @DeclareMiddleware
     */
    private async discoverMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<void> {
        if ('middlewaresDir' in config && config.middlewaresDir) {
            const { discoverMiddlewares } = await import('./resolver.ts')
            await discoverMiddlewares(config.middlewaresDir)
        }
    }

    /**
     * Register named middlewares from config and merge with declared middlewares
     */
    private registerNamedMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        // First, set manually registered middlewares
        if ('middlewares' in config && config.middlewares) {
            this.resolver.setRegistry(config.middlewares)
        }

        // Then merge with @DeclareMiddleware decorated middlewares (takes precedence)
        this.resolver.mergeDeclaredMiddlewares()
    }

    /**
     * Resolve global middlewares from fluent API and config
     */
    private resolveGlobalMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
        pendingGlobalMiddlewares: MiddlewareInput[],
    ): MiddlewareInput[] {
        return [
            ...pendingGlobalMiddlewares,
            ...('globalMiddlewares' in config && config.globalMiddlewares
                ? config.globalMiddlewares
                : []),
        ]
    }

    /**
     * Apply global middlewares to all routes
     */
    private applyGlobalMiddlewares(middlewares: MiddlewareInput[]): void {
        const handlers = this.resolver.resolveMany(middlewares)
        if (handlers.length > 0) {
            this.hono.use('*', ...handlers as any)
        }
    }
}
