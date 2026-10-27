import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type { ErrorHandlerRegistry } from './handler.ts'
import type {
    AppConfig,
    ErrorHandler,
    Module,
    ModuleWithMiddleware,
} from '../types.ts'

/**
 * Handles registration of error handlers.
 */
export class ExceptionRegistrator {
    constructor(
        private readonly registry: ErrorHandlerRegistry,
        private readonly hono: Hono<Env, Schema, string>,
        private readonly rootHono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Orchestrates discovery and registration of error handlers.
     */
    async register(
        config: Module | ModuleWithMiddleware | AppConfig,
        pendingErrorHandler?: ErrorHandler,
    ): Promise<ErrorHandler> {
        // Step 1: Discover and register error handler
        const errorHandler = await this.discoverErrorHandler(
            config,
            pendingErrorHandler,
        )
        this.registerErrorHandler(errorHandler)
        return errorHandler
    }

    /**
     * Register the 404 Not Found handler on the public layer.
     */
    registerNotFoundHandler(errorHandler: ErrorHandler): void {
        this.rootHono.notFound((c) => {
            const error = new Error('Not Found') as any
            error.status = 404
            return errorHandler(error, c as any)
        })
    }

    /**
     * Discover and return the error handler
     */
    private async discoverErrorHandler(
        config: Module | ModuleWithMiddleware | AppConfig,
        pendingErrorHandler?: ErrorHandler,
    ): Promise<ErrorHandler> {
        const providedHandler = pendingErrorHandler ||
            ('errorHandler' in config ? config.errorHandler : undefined)

        return await this.registry.discover(providedHandler)
    }

    /**
     * Register error handler with Hono
     */
    private registerErrorHandler(errorHandler: ErrorHandler): void {
        this.hono.onError((error, c) => {
            return errorHandler(error, c as any)
        })
    }
}
