import { Database } from '@lockness/drizzle'
import { container } from '@lockness/core'
import { UserSeeder } from './user_seeder.ts'
import { PostSeeder } from './post_seeder.ts'

export class DatabaseSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    /**
     * Run the database seeders.
     * Add your seeders to the array below in the order you want them to run.
     */
    async run(): Promise<void> {
        console.log('🌱 Starting database seeding...')

        // Add your seeders here in order
        const seeders: { new (): { run(): Promise<void> } }[] = [
            UserSeeder,
            PostSeeder,
        ]

        for (const Seeder of seeders) {
            const seeder = new Seeder()
            await seeder.run()
        }

        console.log('✅ Database seeding completed!')
    }
}
