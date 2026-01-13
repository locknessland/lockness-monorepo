// deno-lint-ignore-file no-explicit-any
import type { MiddlewareHandler } from 'hono'
import type {
    IMiddleware,
    MiddlewareClass,
    MiddlewareInput,
    MiddlewareRegistry,
} from './types.ts'

/**
 * Resolves middleware from various input types to handler functions.
 * Supports class-based middlewares, function middlewares, and named middleware strings.
 */
export class MiddlewareResolver {
    constructor(private middlewareRegistry: MiddlewareRegistry = {}) {}

    /**
     * Update the middleware registry
     */
    setRegistry(registry: MiddlewareRegistry): void {
        this.middlewareRegistry = registry
    }

    /**
     * Resolve a middleware (class, function, or named string) to a handler function
     *
     * @param middleware - The middleware to resolve (can be a class, function, or string name)
     * @returns A middleware handler function or null if resolution fails
     *
     * @example
     * // Class middleware
     * const handler = resolver.resolve(LoggerMiddleware)
     *
     * // Function middleware
     * const handler = resolver.resolve(sessionMiddleware())
     *
     * // Named middleware
     * const handler = resolver.resolve('auth')
     */
    resolve(
        middleware: MiddlewareInput | string,
    ): MiddlewareHandler | null {
        if (typeof middleware === 'string') {
            // Named middleware - look up in registry
            return this.resolveNamedMiddleware(middleware)
        } else if (typeof middleware === 'function') {
            // Check if it's a class (has prototype with handle) or a plain function
            return this.resolveClassOrFunction(middleware)
        }
        return null
    }

    /**
     * Resolve multiple middlewares at once
     *
     * @param middlewares - Array of middlewares to resolve
     * @returns Array of resolved middleware handlers (excluding any that failed to resolve)
     */
    resolveMany(
        middlewares: (MiddlewareInput | string)[],
    ): MiddlewareHandler[] {
        return middlewares
            .map((m) => this.resolve(m))
            .filter((h) => h !== null) as MiddlewareHandler[]
    }

    /**
     * Resolve a named middleware from the registry
     */
    private resolveNamedMiddleware(name: string): MiddlewareHandler | null {
        const MiddlewareClass = this.middlewareRegistry[name]
        if (!MiddlewareClass) {
            console.warn(
                `⚠️ Named middleware '${name}' not found in registry`,
            )
            return null
        }
        const instance = new MiddlewareClass() as IMiddleware
        return instance.handle.bind(instance)
    }

    /**
     * Resolve a class-based or function middleware
     */
    private resolveClassOrFunction(
        middleware: any,
    ): MiddlewareHandler | null {
        if (middleware.prototype && middleware.prototype.handle) {
            // Class middleware
            const instance =
                new (middleware as MiddlewareClass)() as IMiddleware
            return instance.handle.bind(instance)
        } else {
            // Plain function middleware (like sessionMiddleware())
            return middleware as MiddlewareHandler
        }
    }
}
