# Request Validation

Lockness uses **drizzle-zod** to generate Zod validation schemas directly from
your Drizzle models.

## Basic Validation

Generate validation schemas from your models:

```typescript
// src/model/user.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
})

// Generated schemas with custom refinements
export const insertUserSchema = createInsertSchema(users, {
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
})

export const selectUserSchema = createSelectSchema(users)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

## Using @Validate Decorator

Use the `@Validate` decorator in your controllers:

```typescript
import { Context, Controller, Post, Validate } from 'lockness'
import { insertUserSchema } from '../model/user.ts'

@Controller('/api/users')
export class UserApiController {
    @Post('/')
    @Validate('json', insertUserSchema)
    create(c: Context) {
        const data = c.req.valid('json') // Typed & validated!
        return c.json({ success: true, data })
    }
}
```

## Validation Targets

Validate different parts of the request:

- `json` - Request body (JSON)
- `form` - Form data
- `query` - Query parameters
- `param` - URL parameters
- `header` - HTTP headers
- `cookie` - Cookies

Example with query parameters:

```typescript
const querySchema = z.object({
    page: z.string().transform(Number).pipe(z.number().min(1)),
    limit: z.string().transform(Number).pipe(z.number().max(100)),
})

@Get('/users')
@Validate('query', querySchema)
list(c: Context) {
    const { page, limit } = c.req.valid('query')
    return c.json({ page, limit })
}
```

## Error Responses

On validation failure, Lockness returns:

```json
{
    "success": false,
    "message": "Validation failed",
    "errors": {
        "email": ["Invalid email format"],
        "password": ["Password must be at least 8 characters"]
    }
}
```

## Custom Validation Schemas

Create custom schemas for complex validation:

```typescript
const createPostSchema = z.object({
    title: z.string().min(5).max(200),
    content: z.string().min(10),
    published: z.boolean().default(false),
    tags: z.array(z.string()).max(10).optional(),
    metadata: z.object({
        author: z.string(),
        category: z.enum(['tech', 'news', 'blog']),
    }).optional(),
})

@Post('/posts')
@Validate('json', createPostSchema)
create(c: Context) {
    const data = c.req.valid('json')
    return c.json({ success: true, data })
}
```

## Multiple Validations

Apply multiple validations to a single route:

```typescript
@Put('/:id')
@Validate('param', z.object({ id: z.string().uuid() }))
@Validate('json', updateUserSchema)
update(c: Context) {
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    return c.json({ id, data })
}
```

## Conditional Validation

Use Zod's conditional schemas for complex logic:

```typescript
const userSchema = z.object({
    type: z.enum(['individual', 'business']),
    name: z.string(),
    companyName: z.string().optional(),
}).refine((data) => {
    if (data.type === 'business' && !data.companyName) {
        return false
    }
    return true
}, {
    message: 'Company name is required for business accounts',
    path: ['companyName'],
})
```

## Why drizzle-zod?

drizzle-zod generates Zod schemas from your Drizzle table definitions, so you
define your data structure once in the model. You can add custom refinements
(like email format, min length) while the base schema stays in sync with your
database.
