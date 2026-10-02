# Models & Database

Lockness uses **Drizzle ORM** for type-safe database operations with PostgreSQL.

## Creating Models

Generate a model with all related files:

```bash
deno task cli make:model Post -a
```

The `-a` flag creates:

- `app/model/post.ts` - Drizzle schema + Zod validation
- `app/repository/post_repository.ts` - Data access layer
- `app/controller/post_controller.ts` - REST API controller
- `database/seeders/post_seeder.ts` - Database seeder

## Defining Models

Create a Drizzle table schema:

```typescript
// app/model/post.ts
import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from '@lockness/validator'

export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    published: boolean('published').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

// Validation schemas
export const insertPostSchema = createInsertSchema(posts, {
    title: z.string().min(5).max(200),
    content: z.string().min(10),
})

export const selectPostSchema = createSelectSchema(posts)

// TypeScript types
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
```

## Repositories

Repositories provide a clean data access layer:

```typescript
// app/repository/post_repository.ts
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { type NewPost, type Post, posts } from '../model/post.ts'
import { eq } from 'drizzle-orm'

@Service()
export class PostRepository {
    @Inject(Database)
    accessor database!: Database

    async findAll(): Promise<Post[]> {
        return await this.database.db.select().from(posts)
    }

    async findById(id: number): Promise<Post | undefined> {
        const result = await this.database.db
            .select()
            .from(posts)
            .where(eq(posts.id, id))
        return result[0]
    }

    async create(data: NewPost): Promise<Post> {
        const result = await this.database.db
            .insert(posts)
            .values(data)
            .returning()
        return result[0]
    }

    async update(id: number, data: Partial<NewPost>): Promise<Post> {
        const result = await this.database.db
            .update(posts)
            .set(data)
            .where(eq(posts.id, id))
            .returning()
        return result[0]
    }

    async delete(id: number): Promise<void> {
        await this.database.db.delete(posts).where(eq(posts.id, id))
    }
}
```

## Migrations

Generate migrations from your schema:

```bash
deno task cli db:generate
```

This creates migration files in `migrations/`:

```sql
-- migrations/0001_create_posts.sql
CREATE TABLE "posts" (
    "id" serial PRIMARY KEY,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "published" boolean DEFAULT false,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);
```

Apply migrations:

```bash
deno task cli db:migrate
```

## Seeders

Create seed data for testing:

```typescript
// database/seeders/post_seeder.ts
import { container } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { posts } from '../../app/model/post.ts'

export class PostSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    async run(): Promise<void> {
        await this.database.db.insert(posts).values([
            {
                title: 'First Post',
                content: 'This is the content of the first post',
                published: true,
            },
            {
                title: 'Second Post',
                content: 'This is the content of the second post',
                published: false,
            },
        ])
    }
}
```

`db:seed` instantiates the seeder with `new` and calls `run()` with no argument,
so the seeder takes `Database` from the container itself.

Run seeders:

```bash
# Runs the DatabaseSeeder in database/seeders/database_seeder.ts —
# add PostSeeder to its list
deno task cli db:seed

# Runs database/seeders/post_seeder.ts alone
deno task cli db:seed post
```

## Relationships

Define relationships between models:

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

// Define relations
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
const postsWithAuthors = await database.db.query.posts.findMany({
    with: {
        author: true,
    },
})
```

## Query Building

Use Drizzle's query builder for complex queries:

```typescript
import { and, desc, eq, like } from 'drizzle-orm'

// Find published posts by author
const publishedPosts = await database.db
    .select()
    .from(posts)
    .where(and(
        eq(posts.published, true),
        eq(posts.authorId, userId),
    ))
    .orderBy(desc(posts.createdAt))

// Search posts by title
const searchResults = await database.db
    .select()
    .from(posts)
    .where(like(posts.title, `%${query}%`))
```

## Drizzle Studio

Launch the visual database browser:

```bash
dx drizzle-kit studio
```

This opens Drizzle Studio at `https://local.drizzle.studio` where you can:

- Browse tables and data
- Run queries
- Edit records
- View relationships
- Manage your database visually
