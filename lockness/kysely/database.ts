// deno-lint-ignore-file no-explicit-any
import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { Service } from '@lockness/core'

@Service()
export class Database {
    public db!: Kysely<any>
    private client!: postgres.Sql<Record<string, never>>

    /**
     * Connect to the database
     */
    public async connect(url: string) {
        try {
            this.client = postgres(url)
            this.db = new Kysely({
                dialect: new PostgresJSDialect({
                    postgres: this.client,
                }),
            })

            // Verify the connection by running a simple query
            await this.db.executeQuery(
                // @ts-ignore: compiled query mock
                { sql: 'SELECT 1', parameters: [], query: { kind: 'RawNode' } },
            )
            // Or simpler check:
            // await this.client`SELECT 1`

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
        if (this.db) {
            await this.db.destroy()
        }
        if (this.client) {
            await this.client.end()
        }
    }
}
