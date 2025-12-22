import { Database } from '@lockness/drizzle'
import { container } from 'lockness'
import { users } from '@model/user.ts'

export class UserSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    async run(): Promise<void> {
        console.log('🌱 Running UserSeeder...')

        await this.database.db.insert(users).values([
            { email: 'admin@lockness.dev' },
            { email: 'user@lockness.dev' },
        ]).onConflictDoNothing()

        console.log('✅ UserSeeder completed')
    }
}
