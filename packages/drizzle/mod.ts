/**
 * @fileoverview Drizzle ORM integration for Lockness framework.
 *
 * Provides database connection management and Drizzle ORM setup for PostgreSQL.
 * This module exports the main Database service and CLI command registration.
 *
 * @module @lockness/drizzle
 *
 * @example
 * ```ts
 * import { Database } from '@lockness/drizzle'
 * import { container } from '@lockness/contract'
 *
 * const db = container.get<Database>(Database)
 * await db.connect(Deno.env.get('DATABASE_URL')!)
 *
 * // Use db.db for Drizzle queries
 * const users = await db.db.select().from(usersTable)
 *
 * await db.close()
 * ```
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Service } from '@lockness/container'

export { registerDrizzleCommands } from './cli_commands.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Database schema type for Drizzle ORM.
 *
 * Used as a generic constraint for the PostgresJsDatabase type.
 */
export type DatabaseSchema = Record<string, unknown>

/**
 * Connection options for the Database service.
 */
export interface ConnectionOptions {
    /** Whether to suppress the success message */
    readonly silent?: boolean
}

/**
 * Result of a database connection attempt.
 */
export interface ConnectionResult {
    /** Whether the connection was successful */
    readonly success: boolean
    /** Error message if connection failed */
    readonly error?: string
}

// =============================================================================
// Database Service
// =============================================================================

/**
 * Database service for managing PostgreSQL connections via Drizzle ORM.
 *
 * This service is registered as a singleton in the DI container and provides
 * a managed connection to PostgreSQL with automatic Drizzle ORM setup.
 *
 * @example
 * ```ts
 * // In a controller or service
 * @Controller('/users')
 * class UserController {
 *   constructor(private database: Database) {}
 *
 *   @Get('/')
 *   async list() {
 *     const users = await this.database.db.select().from(usersTable)
 *     return { users }
 *   }
 * }
 * ```
 */
@Service()
export class Database {
    /**
     * Drizzle ORM database instance.
     *
     * Use this property to execute Drizzle queries after connecting.
     */
    public db!: PostgresJsDatabase<DatabaseSchema>

    /**
     * Underlying postgres.js client instance.
     * @internal
     */
    private client!: postgres.Sql<Record<string, never>>

    /**
     * Connect to the PostgreSQL database.
     *
     * Establishes a connection using the provided URL and initializes
     * the Drizzle ORM instance. Connection is verified with a test query.
     *
     * @param url - PostgreSQL connection URL (e.g., 'postgres://user:pass@localhost:5432/db')
     * @param options - Optional connection configuration
     * @returns Connection result with success status
     *
     * @example
     * ```ts
     * const db = container.get<Database>(Database)
     * const result = await db.connect(Deno.env.get('DATABASE_URL')!)
     *
     * if (!result.success) {
     *   console.error('Failed to connect:', result.error)
     * }
     * ```
     */
    public async connect(
        url: string,
        options: ConnectionOptions = {},
    ): Promise<ConnectionResult> {
        try {
            this.client = postgres(url)
            this.db = drizzle(this.client)

            // Verify the connection
            await this.client`SELECT 1`

            if (!options.silent) {
                console.log('✅ Database connected')
            }

            return { success: true }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error)

            console.error('❌ Database connection failed:', message)

            return { success: false, error: message }
        }
    }

    /**
     * Close the database connection.
     *
     * Gracefully terminates the PostgreSQL connection. Safe to call
     * multiple times or when not connected.
     *
     * @example
     * ```ts
     * // In cleanup or shutdown
     * await db.close()
     * ```
     */
    public async close(): Promise<void> {
        if (this.client) {
            await this.client.end()
        }
    }

    /**
     * Check if the database is currently connected.
     *
     * @returns True if a connection has been established
     */
    public isConnected(): boolean {
        return this.client !== undefined && this.db !== undefined
    }
}
