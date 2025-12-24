/**
 * @lockness/auth - Drizzle User Provider for Basic Auth Guard
 *
 * Simple user provider for HTTP Basic Authentication using Drizzle ORM.
 */

import type { Database } from '@lockness/drizzle'
import type {
    Authenticatable,
    BasicAuthUserProviderContract,
    PROVIDER_REAL_USER,
} from '../types.ts'

/**
 * Options for Drizzle Basic Auth User Provider
 */
export interface DrizzleBasicAuthProviderOptions<User extends Authenticatable> {
    /**
     * Database instance
     */
    db: Database

    /**
     * Function to find user by ID
     */
    findUserById: (db: Database, id: string | number) => Promise<User | null>

    /**
     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: Database,
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
    implements BasicAuthUserProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    #options: Required<DrizzleBasicAuthProviderOptions<User>>

    constructor(options: DrizzleBasicAuthProviderOptions<User>) {
        this.#options = {
            ...options,
            verifyPassword: options.verifyPassword ??
                this.#defaultVerifyPassword,
        }
    }

    /**
     * Default password verification (direct comparison - not secure for production)
     */
    #defaultVerifyPassword(plain: string, hash: string): Promise<boolean> {
        return Promise.resolve(plain === hash)
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
     * Verify password
     */
    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await this.#options.verifyPassword(plain, hash)
    }
}
