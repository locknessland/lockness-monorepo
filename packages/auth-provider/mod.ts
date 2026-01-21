/**
 * @fileoverview ORM-agnostic authentication provider implementations.
 *
 * This package provides abstract base classes and ORM-specific implementations
 * for authentication providers. Supports session-based, token-based, and basic
 * authentication patterns.
 *
 * @module @lockness/auth-provider
 *
 * @example
 * ```ts
 * // Using with Drizzle ORM
 * import { DrizzleSessionProvider } from '@lockness/auth-provider/drizzle'
 *
 * const provider = new DrizzleSessionProvider({
 *   db,
 *   findUserById: async (db, id) => db.query.users.findFirst({ where: eq(users.id, id) }),
 *   findUserByCredentials: async (db, email, password) => {
 *     const user = await db.query.users.findFirst({ where: eq(users.email, email) })
 *     if (user && await bcrypt.compare(password, user.password)) return user
 *     return null
 *   }
 * })
 * ```
 */

export { SessionProviderBase } from './base/mod.ts'
export { TokenProviderBase } from './base/mod.ts'
export { BasicAuthProviderBase } from './base/mod.ts'
