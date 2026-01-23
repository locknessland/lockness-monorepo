import { Database } from '@lockness/drizzle'
import { container } from '@lockness/core'
import { users } from '@model/user.ts'

export class UserSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    async run(): Promise<void> {
        console.log('🌱 Running UserSeeder...')

        await this.database.db.insert(users).values([
            { email: 'admin@lockness.land' },
            { email: 'user@lockness.land' },
        ]).onConflictDoNothing()

        console.log('✅ UserSeeder completed')
    }
}
