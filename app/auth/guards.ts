/**
 * @fileoverview Authentication Guards Configuration
 *
 * This module defines the authentication guards used throughout the application.
 * Guards determine how users are authenticated for different contexts.
 *
 * @module app/auth/guards
 *
 * @example
 * ```typescript
 * import { authConfig } from './auth/guards.ts'
 * import { initializeAuthMiddleware } from '@lockness/auth'
 *
 * // In kernel.tsx
 * initializeAuthMiddleware(authConfig)
 * ```
 */

import { container } from '@lockness/container'
import { Database } from '@lockness/drizzle'
import { type AuthConfig, SessionGuard } from '@lockness/auth'
import type { Context } from '@lockness/hono'
import { UserProvider } from './user_provider.ts'

/**
 * Creates a web session guard for cookie-based authentication.
 *
 * This guard:
 * - Uses the database connection from the DI container
 * - Authenticates users via session cookies
 * - Loads user data through the UserProvider
 *
 * @param ctx - The Hono context
 * @returns A configured SessionGuard instance
 */
export function createWebGuard(ctx: Context) {
    const db = container.get<Database>(Database)
    return new SessionGuard('web', ctx, new UserProvider(db))
}

/**
 * Authentication configuration for the application.
 *
 * Defines all available authentication guards and the default guard to use.
 *
 * @example Adding an API guard
 * ```typescript
 * export const authConfig: AuthConfig = {
 *     default: 'web',
 *     guards: {
 *         web: createWebGuard,
 *         api: (ctx) => new TokenGuard('api', ctx, new UserProvider(db)),
 *     },
 * }
 * ```
 */
export const authConfig: AuthConfig = {
    /**
     * The default guard to use when none is specified.
     * Used by `auth()` helper without arguments.
     */
    default: 'web',

    /**
     * Available authentication guards.
     *
     * - `web`: Session-based authentication for browser requests
     *
     * Add more guards as needed (e.g., 'api' for token-based auth)
     */
    guards: {
        web: createWebGuard,
    },
}
