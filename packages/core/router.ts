/**
 * Router utility for named routes
 */

export const namedRoutes: Map<string, string> = new Map<string, string>()

/**
 * Generate a URL for a named route
 *
 * @example
 * route('user.show', { id: 123 }) // returns '/users/123'
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
