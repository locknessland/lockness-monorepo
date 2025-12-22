// deno-lint-ignore-file no-explicit-any
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Service } from './container.ts'

@Service()
export class Database {
    private client?: postgres.Sql<Record<string, never>>
    public db!: any // Using ! and any for flexibility in the core

    /**
     * Connect to the database
     */
    public async connect(url: string, schema?: any) {
        this.client = postgres(url)
        this.db = drizzle(this.client, { schema })
        console.log('✅ Database connected')
        // We don't strictly need await here for postgres.js client creation
        // but it's good practice for the connect method signature
        await Promise.resolve()
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
