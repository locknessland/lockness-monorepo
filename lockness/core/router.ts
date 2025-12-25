/**
 * Router utility for named routes
 */

export const namedRoutes = new Map<string, string>()

/**
 * Generate a URL for a named route
 * 
 * @example
 * route('user.show', { id: 123 }) // returns '/users/123'
 */
export function route(name: string, params: Record<string, string | number> = {}): string {
    let path = namedRoutes.get(name)
    if (!path) {
        console.warn(`⚠️ Route "${name}" not found in registered routes`)
        return `#route-not-found-${name}`
    }

    // Replace parameters like :id or :slug
    for (const [key, value] of Object.entries(params)) {
        path = path.replace(`:${key}`, String(value))
    }

    return path
}
