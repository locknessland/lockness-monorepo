import { User } from '@model/user.ts'

export class UserRepository {
    /**
     * Find all User
     */
    async findAll(): Promise<User[]> {
        // TODO: Implement database logic
        return []
    }

    /**
     * Find User by ID
     */
    async findById(id: number): Promise<User | null> {
        // TODO: Implement database logic
        return null
    }

    /**
     * Create a new User
     */
    async create(data: Partial<User>): Promise<User> {
        // TODO: Implement database logic
        return new User(data)
    }
}
