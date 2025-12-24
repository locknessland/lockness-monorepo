import { Inject, Service } from 'lockness'
import { Database } from '@lockness/drizzle'
import { type NewUser, type User, users } from '@model/user.ts'
import { eq } from 'drizzle-orm'

@Service()
export class UserRepository {
    @Inject(Database)
    accessor database!: Database

    /**
     * Find all User
     */
    async findAll(): Promise<User[]> {
        return await this.database.db.select().from(users)
    }

    /**
     * Find User by ID
     */
    async findById(id: number): Promise<User | null> {
        const result = await this.database.db.select().from(users).where(
            eq(users.id, id),
        )
        return result[0] || null
    }

    /**
     * Create a new User
     */
    async create(data: NewUser): Promise<User> {
        const result = await this.database.db.insert(users).values(data)
            .returning()
        return result[0]
    }
}
