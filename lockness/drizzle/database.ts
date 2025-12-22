// deno-lint-ignore-file no-explicit-any
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Service } from '@lockness/core'

@Service()
export class Database {
    private client?: postgres.Sql<Record<string, never>>
    public db!: any // Using ! and any for flexibility in the core

    /**
     * Connect to the database
     */
    public async connect(url: string, schema?: any) {
        try {
            this.client = postgres(url)
            this.db = drizzle(this.client, { schema })

            // Verify the connection by running a simple query
            await this.client`SELECT 1`
            console.log('✅ Database connected')
        } catch (error) {
            console.error('❌ Database connection failed:', (error as Error).message)
            // We don't throw here to avoid crashing the whole app if DB is optional,
            // but the user will see the error in the console.
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
