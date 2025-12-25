# @lockness/drizzle

Drizzle ORM integration for Lockness framework with PostgreSQL support.

## Features

- 🗄️ **PostgreSQL** integration via Drizzle ORM
- 🔄 **Migration management** with automatic generation
- 🌱 **Database seeding** system
- 🎨 **Drizzle Studio** visual database browser
- 🏗️ **CLI scaffolding** for models, repositories, and controllers
- 💉 **Dependency injection** ready
- 🔒 **Type-safe** queries with full TypeScript support

## Installation

```bash
deno add @lockness/drizzle
```

## Database Configuration

Create a `.env` file with your database credentials:

```env
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

Create `drizzle.config.ts` at your project root:

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/model/*.ts',
    out: './migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: Deno.env.get('DATABASE_URL')!,
    },
})
```

## Basic Usage

### Initialize Database Connection

```typescript
import { createApp } from '@lockness/core'
import { Database } from '@lockness/drizzle'

const app = createApp()

// Database instance is available via dependency injection
app.get('/users', async (c) => {
    const db = c.get('container').resolve(Database)
    const users = await db.instance.select().from(usersTable)
    return c.json(users)
})
```

## CLI Commands

### Generate Model

Create a complete model with schema, validation, repository, controller, and
seeder:

```bash
deno task cli make:model Post -a
```

Without `-a` flag, creates only the model file:

```bash
deno task cli make:model Post
```

### Generate Migration

Create a migration from your schema changes:

```bash
deno task cli db:generate
```

This generates SQL migration files in the `migrations/` directory.

### Run Migrations

Apply pending migrations to your database:

```bash
deno task cli db:migrate
```

### Seed Database

Run all seeders to populate your database:

```bash
deno task cli db:seed
```

### Drizzle Studio

Launch the visual database browser:

```bash
dx drizzle-kit studio
```

This opens Drizzle Studio where you can:

- Browse and edit tables
- Run SQL queries
- View relationships
- Manage data visually

## Model Definition

Define your database schema with Drizzle:

```typescript
// src/model/user.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Zod validation schemas
export const insertUserSchema = createInsertSchema(users, {
    email: z.string().email(),
    name: z.string().min(2).max(100),
})

export const selectUserSchema = createSelectSchema(users)

// TypeScript types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

## Repository Pattern

Create a repository for clean data access:

```typescript
// src/repository/user_repository.ts
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { eq } from 'drizzle-orm'
import { type NewUser, type User, users } from '../model/user.ts'

@Service()
export class UserRepository {
    @Inject(Database)
    accessor db!: Database

    async findAll(): Promise<User[]> {
        return await this.db.instance.select().from(users)
    }

    async findById(id: number): Promise<User | undefined> {
        const result = await this.db.instance
            .select()
            .from(users)
            .where(eq(users.id, id))
        return result[0]
    }

    async create(data: NewUser): Promise<User> {
        const result = await this.db.instance
            .insert(users)
            .values(data)
            .returning()
        return result[0]
    }

    async update(id: number, data: Partial<NewUser>): Promise<User> {
        const result = await this.db.instance
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning()
        return result[0]
    }

    async delete(id: number): Promise<void> {
        await this.db.instance.delete(users).where(eq(users.id, id))
    }
}
```

## Seeding

Create seed data for development and testing:

```typescript
// src/seeder/user_seeder.ts
import { Database } from '@lockness/drizzle'
import { users } from '../model/user.ts'

export class UserSeeder {
    async run(db: Database) {
        await db.instance.insert(users).values([
            {
                email: 'alice@example.com',
                name: 'Alice Smith',
            },
            {
                email: 'bob@example.com',
                name: 'Bob Johnson',
            },
        ])
    }
}
```

Register in `src/seeder/database_seeder.ts`:

```typescript
import { UserSeeder } from './user_seeder.ts'

export const seeders = [
    UserSeeder,
    // Add more seeders...
]
```

## Relationships

Define relationships between tables:

```typescript
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
})

export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    authorId: integer('author_id').references(() => users.id),
})

export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
}))

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, {
        fields: [posts.authorId],
        references: [users.id],
    }),
}))
```

Query with relations:

```typescript
const usersWithPosts = await db.instance.query.users.findMany({
    with: {
        posts: true,
    },
})
```

## Advanced Queries

Use Drizzle's powerful query builder:

```typescript
import { and, desc, eq, gt, like } from 'drizzle-orm'

// Complex filtering
const activeUsers = await db.instance
    .select()
    .from(users)
    .where(and(
        eq(users.status, 'active'),
        gt(users.createdAt, new Date('2024-01-01')),
    ))
    .orderBy(desc(users.createdAt))
    .limit(10)

// Search with pattern matching
const searchResults = await db.instance
    .select()
    .from(users)
    .where(like(users.name, `%${query}%`))

// Joins
const postsWithAuthors = await db.instance
    .select({
        postId: posts.id,
        postTitle: posts.title,
        authorName: users.name,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
```

## Transactions

Execute multiple operations atomically:

```typescript
await db.instance.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
        email: 'new@example.com',
        name: 'New User',
    }).returning()

    await tx.insert(posts).values({
        title: 'First Post',
        authorId: user.id,
    })
})
```

## Migration Workflow

1. **Modify your schema** in `src/model/*.ts`
2. **Generate migration**: `deno task cli db:generate`
3. **Review migration** in `migrations/` directory
4. **Apply migration**: `deno task cli db:migrate`

## Best Practices

- ✅ Use repositories for data access
- ✅ Define Zod schemas for validation
- ✅ Use transactions for related operations
- ✅ Create migrations for all schema changes
- ✅ Use seeders for test data
- ✅ Leverage TypeScript types from Drizzle

## Dependencies

- `drizzle-orm` - ORM library
- `drizzle-kit` - CLI tools for migrations
- `drizzle-zod` - Zod schema generation
- `postgres` - PostgreSQL client

## License

MIT
