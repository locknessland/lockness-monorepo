/**
 * @fileoverview Named Routes Module
 *
 * Provides URL generation for named routes. Routes are registered
 * automatically when controllers are loaded, using the `name` option
 * in route decorators.
 *
 * @module @lockness/core/router
 *
 * @example
 * ```typescript
 * // In controller:
 * @Get('/users/:id', { name: 'user.show' })
 * show(c: Context) { ... }
 *
 * // Generate URL:
 * route('user.show', { id: 123 }) // => '/users/123'
 * ```
 */

/**
 * Global registry of named routes.
 *
 * Maps route names to their URL patterns. Populated automatically
 * during controller registration.
 *
 * @internal Use the `route()` function instead of accessing directly.
 */
export const namedRoutes: Map<string, string> = new Map<string, string>()

/**
 * Generates a URL for a named route with parameter substitution.
 *
 * Replaces path parameters (`:param`) with provided values.
 * Throws an error if the route name is not registered.
 *
 * @param name - The route name (e.g., 'user.show', 'posts.index')
 * @param params - Object mapping parameter names to values
 * @returns The generated URL path
 *
 * @throws {Error} If the route name is not found in the registry
 *
 * @example Simple route
 * ```typescript
 * // Route: @Get('/users', { name: 'users.index' })
 * route('users.index') // => '/users'
 * ```
 *
 * @example Route with parameters
 * ```typescript
 * // Route: @Get('/users/:id', { name: 'user.show' })
 * route('user.show', { id: 123 }) // => '/users/123'
 * ```
 *
 * @example Multiple parameters
 * ```typescript
 * // Route: @Get('/posts/:postId/comments/:commentId', { name: 'comment.show' })
 * route('comment.show', { postId: 1, commentId: 5 }) // => '/posts/1/comments/5'
 * ```
 */
export function route(
    name: string,
    params: Record<string, string | number> = {},
): string {
    let path = namedRoutes.get(name)
    if (!path) {
        throw new Error(`Route "${name}" not found in registered routes`)
    }

    // Replace parameters like :id or :slug
    for (const [key, value] of Object.entries(params)) {
        path = path.replace(`:${key}`, String(value))
    }

    return path
}
