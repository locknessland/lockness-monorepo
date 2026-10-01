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
    MiddlewareClass,
    MiddlewareContract,
    MiddlewareInput,
    MiddlewareRegistry,
} from '../types.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'
import { renderError, safeForLog } from '../logging/sanitize.ts'
import { importAppFile } from '@lockness/contract'
import { resolve } from '@std/path'

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

    // Anchored at the app root (#474)
    const absoluteDir = resolve(Deno.cwd(), directory)

    // Find all .ts and .tsx files in the directory
    const names: string[] = []
    try {
        for await (const entry of Deno.readDir(absoluteDir)) {
            if (
                entry.isFile &&
                (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
            ) {
                names.push(entry.name)
            }
        }
    } catch (error) {
        // An absent directory is a valid configuration; anything else is not.
        if (!(error instanceof Deno.errors.NotFound)) {
            console.warn(
                `⚠️  Middleware directory ${
                    safeForLog(directory)
                } could not be read, so no middleware was discovered: ${
                    renderError(error)
                }`,
            )
        }
        return 0
    }

    // Import each file to trigger @DeclareMiddleware decorators. A file that
    // fails is reported and skipped, so the others still register (#473):
    // left silent, the first sign was a later "unknown middleware" error, or a
    // route running without its middleware.
    for (const name of names) {
        try {
            await importAppFile(name, absoluteDir)
        } catch (error) {
            console.error(
                `❌ Middleware file ${
                    safeForLog(`${directory}/${name}`)
                } failed to import, so the middlewares it declares are not registered: ${
                    renderError(error)
                }`,
            )
        }
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
        const instance = new MiddlewareClassRef() as MiddlewareContract
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
                new (middleware as MiddlewareClass)() as MiddlewareContract
            return instance.handle.bind(instance)
        } else {
            // Plain function middleware (like sessionMiddleware())
            return middleware as MiddlewareHandler
        }
    }
}
