/**
 * @fileoverview HTTP Basic Authentication provider using Drizzle ORM.
 *
 * Extends {@link BasicAuthProviderBase} to inherit shared password verification logic.
 *
 * @module @lockness/auth-provider/drizzle/basic-auth
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Authenticatable } from '@lockness/auth'
import { BasicAuthProviderBase } from '../base/basic_auth_provider_base.ts'

/**
 * Configuration options for Drizzle basic auth user provider.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 */
export interface DrizzleBasicAuthProviderOptions<User extends Authenticatable> {
    /**
     * Drizzle database instance (from @lockness/drizzle Database service)
     */
    db: PostgresJsDatabase<Record<string, unknown>>

    /**
     * Function to find user by ID
     */
    findUserById: (
        db: PostgresJsDatabase<Record<string, unknown>>,
        id: string | number,
    ) => Promise<User | null>

    /**
     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: PostgresJsDatabase<Record<string, unknown>>,
        email: string,
        password: string,
    ) => Promise<User | null>

    /**
     * Function to verify password (for custom hashing)
     */
    verifyPassword?: (plain: string, hash: string) => Promise<boolean>
}

/**
 * Drizzle-based user provider for basic authentication
 *
 * @example
 * const provider = new DrizzleBasicAuthProvider({
 *   db,
 *   findUserById: async (db, id) => {
 *     return await db.query.users.findFirst({
 *       where: (users, { eq }) => eq(users.id, id)
 *     })
 *   },
 *   findUserByCredentials: async (db, email, password) => {
 *     const user = await db.query.users.findFirst({
 *       where: (users, { eq }) => eq(users.email, email)
 *     })
 *     if (user && await bcrypt.compare(password, user.password)) {
 *       return user
 *     }
 *     return null
 *   }
 * })
 */
export class DrizzleBasicAuthProvider<User extends Authenticatable>
    extends BasicAuthProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: Required<DrizzleBasicAuthProviderOptions<User>>

    constructor(options: DrizzleBasicAuthProviderOptions<User>) {
        super()
        this.#options = {
            ...options,
            verifyPassword: options.verifyPassword ??
                this.defaultVerifyPassword.bind(this),
        }
    }

    /**
     * Find user by ID
     */
    async findById(id: string | number): Promise<User | null> {
        return await this.#options.findUserById(this.#options.db, id)
    }

    /**
     * Find user by credentials
     */
    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        return await this.#options.findUserByCredentials(
            this.#options.db,
            email,
            password,
        )
    }

    /**
     * Verify password hash
     */
    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await this.#options.verifyPassword(plain, hash)
    }
}
