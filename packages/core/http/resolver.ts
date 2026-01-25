/**
 * @fileoverview Middleware Resolver Module
 *
 * Resolves middleware from various input types (classes, functions, strings)
 * to Hono middleware handler functions.
 *
 * @module @lockness/core/middleware_resolver
 */

import type { MiddlewareHandler } from 'hono'
import type {
    IMiddleware,
    MiddlewareClass,
    MiddlewareInput,
    MiddlewareRegistry,
} from '../types.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'

/**
 * Discovers middlewares decorated with @DeclareMiddleware from a directory.
 *
 * @param directory - Path to the directory containing middleware files
 * @returns Promise resolving to middleware count
 *
 * @example
 * ```typescript
 * await discoverMiddlewares('./app/middleware')
 * ```
 *
 * @internal
 */
export async function discoverMiddlewares(
    directory: string,
): Promise<number> {
    const startCount = declaredMiddlewares.size

    try {
        // Resolve directory to absolute path
        const absoluteDir = directory.startsWith('/')
            ? directory
            : `${Deno.cwd()}/${directory.replace(/^\.\//, '')}`

        // Find all .ts and .tsx files recursively
        const files: string[] = []
        for await (const entry of Deno.readDir(absoluteDir)) {
            if (
                entry.isFile &&
                (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
            ) {
                files.push(`${absoluteDir}/${entry.name}`)
            }
        }

        // Import each file to trigger @DeclareMiddleware decorators
        for (const file of files) {
            try {
                await import(`file://${file}`)
            } catch (_error) {
                // Ignore import errors for middleware discovery
                // Middlewares are registered during class decoration, not instantiation
            }
        }
    } catch (_error) {
        // Directory doesn't exist or can't be read - that's okay
    }

    return declaredMiddlewares.size - startCount
}

/**
 * Resolves middleware from various input types to handler functions.
 *
 * Supports:
 * - **Class middlewares**: Classes with a `handle` method
 * - **Function middlewares**: Direct Hono middleware functions
 * - **Named middlewares**: String names looked up in a registry
 *
 * @example
 * ```typescript
 * const resolver = new MiddlewareResolver()
 *
 * // Class middleware
 * const handler = resolver.resolve(LoggerMiddleware)
 *
 * // Function middleware
 * const handler = resolver.resolve(cors())
 *
 * // Named middleware (requires registry)
 * resolver.setRegistry({ auth: AuthMiddleware })
 * const handler = resolver.resolve('auth')
 * ```
 */
export class MiddlewareResolver {
    /**
     * Creates a new MiddlewareResolver instance.
     *
     * @param middlewareRegistry - Optional initial registry of named middlewares
     */
    constructor(private middlewareRegistry: MiddlewareRegistry = {}) {}

    /**
     * Updates the named middleware registry.
     *
     * @param registry - Object mapping names to middleware classes
     *
     * @example
     * ```typescript
     * resolver.setRegistry({
     *     auth: AuthMiddleware,
     *     admin: AdminMiddleware,
     * })
     * ```
     */
    setRegistry(registry: MiddlewareRegistry): void {
        this.middlewareRegistry = registry
    }

    /**
     * Merges declared middlewares (from @DeclareMiddleware decorator) with the current registry.
     * Declared middlewares take precedence over manually registered ones.
     *
     * @example
     * ```typescript
     * // After middleware classes are decorated with @DeclareMiddleware
     * resolver.mergeDeclaredMiddlewares()
     * ```
     *
     * @internal
     */
    mergeDeclaredMiddlewares(): void {
        const declared: MiddlewareRegistry = {}
        for (const [name, middlewareClass] of declaredMiddlewares.entries()) {
            declared[name] = middlewareClass
        }

        // Merge: declared middlewares take precedence
        this.middlewareRegistry = { ...this.middlewareRegistry, ...declared }
    }

    /**
     * Resolves a middleware to a Hono handler function.
     *
     * @param middleware - The middleware to resolve:
     *   - String: Looked up in the named middleware registry
     *   - Class: Instantiated and `handle` method bound
     *   - Function: Returned as-is
     * @returns A middleware handler function, or `null` if resolution fails
     *
     * @example Class middleware
     * ```typescript
     * const handler = resolver.resolve(LoggerMiddleware)
     * ```
     *
     * @example Function middleware
     * ```typescript
     * const handler = resolver.resolve(sessionMiddleware())
     * ```
     *
     * @example Named middleware
     * ```typescript
     * const handler = resolver.resolve('auth')
     * ```
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
     * Resolves multiple middlewares at once.
     *
     * Filters out any middlewares that fail to resolve.
     *
     * @param middlewares - Array of middlewares to resolve
     * @returns Array of resolved middleware handlers
     *
     * @example
     * ```typescript
     * const handlers = resolver.resolveMany([
     *     LoggerMiddleware,
     *     'auth',
     *     cors(),
     * ])
     * ```
     */
    resolveMany(
        middlewares: (MiddlewareInput | string)[],
    ): MiddlewareHandler[] {
        return middlewares
            .map((m) => this.resolve(m))
            .filter((h): h is MiddlewareHandler => h !== null)
    }

    /**
     * Resolves a named middleware from the registry.
     *
     * @param name - The middleware name
     * @returns The middleware handler, or `null` if not found
     *
     * @internal
     */
    private resolveNamedMiddleware(name: string): MiddlewareHandler | null {
        const MiddlewareClassRef = this.middlewareRegistry[name]
        if (!MiddlewareClassRef) {
            console.warn(
                `⚠️ Named middleware '${name}' not found in registry`,
            )
            return null
        }
        const instance = new MiddlewareClassRef() as IMiddleware
        return instance.handle.bind(instance)
    }

    /**
     * Resolves a class-based or function middleware.
     *
     * @param middleware - The middleware class or function
     * @returns The middleware handler
     *
     * @internal
     */
    private resolveClassOrFunction(
        middleware: MiddlewareInput,
    ): MiddlewareHandler | null {
        // Check if it's a class with a handle method
        if (
            typeof middleware === 'function' &&
            'prototype' in middleware &&
            middleware.prototype?.handle
        ) {
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
