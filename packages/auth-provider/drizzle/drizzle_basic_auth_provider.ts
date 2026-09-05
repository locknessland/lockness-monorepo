/**
 * @fileoverview HTTP Basic Authentication provider using Drizzle ORM.
 *
 * Extends {@link BasicAuthProviderBase} to inherit shared password verification logic.
 *
 * @module @lockness/auth-provider/drizzle/basic-auth
 */

import type { Authenticatable } from '@lockness/auth'
import { BasicAuthProviderBase } from '../base/basic_auth_provider_base.ts'
import type { DrizzleDatabase, DrizzleDialect } from './database.ts'

/**
 * Configuration options for Drizzle basic auth user provider.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 * @typeParam D - The SQL dialect of the Drizzle handle (`pg` by default), so a
 * `mysql` or `sqlite` `Database` handle from the #214 multi-DB work is accepted.
 */
export interface DrizzleBasicAuthProviderOptions<
    User extends Authenticatable,
    D extends DrizzleDialect = 'pg',
> {
    /**
     * Drizzle database instance (from @lockness/drizzle Database service),
     * typed by dialect `D`.
     */
    db: DrizzleDatabase<D>

    /**
     * Function to find user by ID
     */
    findUserById: (
        db: DrizzleDatabase<D>,
        id: string | number,
    ) => Promise<User | null>

    /**
     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: DrizzleDatabase<D>,
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
export class DrizzleBasicAuthProvider<
    User extends Authenticatable,
    D extends DrizzleDialect = 'pg',
> extends BasicAuthProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: Required<DrizzleBasicAuthProviderOptions<User, D>>

    constructor(options: DrizzleBasicAuthProviderOptions<User, D>) {
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
