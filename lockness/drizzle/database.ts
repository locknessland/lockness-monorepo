import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Service } from '@lockness/core'

// @ts-ignore: Decorator type mismatch
@Service()
export class Database {
    public db!: PostgresJsDatabase<Record<string, unknown>>
    private client!: postgres.Sql<Record<string, never>>

    /**
     * Connect to the database
     */
    public async connect(url: string) {
        try {
            this.client = postgres(url)
            this.db = drizzle(this.client)

            // Verify the connection
            await this.client`SELECT 1`

            console.log('✅ Database connected')
        } catch (error) {
            console.error(
                '❌ Database connection failed:',
                (error as Error).message,
            )
        }
    }

    /**
     * Close the connection
     */
    public async close() {
        if (this.client) {
            await this.client.end()
        }
    }
}
