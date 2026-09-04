# Pagination & API Resources

Lockness ships a DB-agnostic paginator, a Drizzle `paginate()` helper, and an
API Resource layer for shaping consistent JSON output. Everything is imported
from `@lockness/core` (the paginator surfaces through it from
`@lockness/contract`); the Drizzle helper comes from `@lockness/drizzle`.

- [Pagination](#pagination)
  - [Offset pagination](#offset-pagination)
  - [Cursor pagination](#cursor-pagination)
  - [Binding to the UI `Pagination` component](#binding-to-the-ui-pagination-component)
  - [The pure paginator](#the-pure-paginator)
- [API Resources](#api-resources)
  - [A single resource](#a-single-resource)
  - [Collections & pagination](#collections--pagination)
  - [`make:resource`](#makeresource)

---

## Pagination

The paginator returns a `{ data, meta, links }` envelope. Two strategies:

| Strategy   | `meta` carries                                                | Use it when                           |
| ---------- | ------------------------------------------------------------- | ------------------------------------- |
| **offset** | `total`, `perPage`, `currentPage`, `lastPage`, `from`, `to`   | you need page numbers / a total count |
| **cursor** | `perPage`, `nextCursor`, `prevCursor`, `hasMore` (no `total`) | large tables — it skips `COUNT(*)`    |

Navigation `links` are always **relative** (`/users?page=2`) — the paginator
never reflects the request `Host`, so the envelope is safe to cache and to hand
to clients.

**Bounds are enforced in one place.** `perPage` is clamped to a maximum
(`MAX_PER_PAGE`, default 100) and `page` is floored to ≥ 1 **and** capped to the
last page — an oversized `?page=` or `?perPage=` can never trigger an unbounded
fetch or a giant SQL `OFFSET`.

### Offset pagination

```typescript
import { Database, paginate } from '@lockness/drizzle'
import { readPaginationParams } from '@lockness/core'
import { eq } from 'drizzle-orm'
import { posts } from '../model/post.ts'

@Controller('/posts')
class PostController {
    constructor(private db: Database) {}

    @Get('/')
    async index(c: Context) {
        const { page, perPage } = readPaginationParams(c.req.query())

        const result = await paginate<Post>(this.db.db, posts, {
            page,
            perPage,
            baseUrl: '/posts',
            where: eq(posts.published, true), // your filter — never dropped
            orderBy: [desc(posts.createdAt)],
        })

        return c.json(result)
        // { data: [...], meta: { total, currentPage, lastPage, ... }, links: {...} }
    }
}
```

> **Your `where` filter is preserved.** `paginate()` takes your filter
> _conditions_ and composes the pagination predicate onto them; the `count`
> query reuses the same conditions. A tenancy/ownership filter passed here is
> counted and applied on every page — it cannot be silently dropped.

### Cursor pagination

Cursor pagination avoids the `COUNT(*)` and is the recommended path for large or
infinite-scroll listings. Cursors are **opaque tokens** — never the raw column
value on the wire.

```typescript
import { paginate } from '@lockness/drizzle'
import { asc } from 'drizzle-orm'

const result = await paginate<Post>(this.db.db, posts, {
    strategy: 'cursor',
    perPage: 20,
    baseUrl: '/feed',
    where: eq(posts.published, true),
    cursorColumn: posts.id,
    cursorOf: (row) => row.id, // how to read the ordering position
    direction: 'asc',
    cursor: c.req.query('cursor'), // opaque token from the previous page
})

return c.json(result)
// { data: [...], meta: { perPage, nextCursor, prevCursor, hasMore }, links: {...} }
```

### Binding to the UI `Pagination` component

`toPaginationProps` maps offset `meta` onto the props the `@lockness/ui`
`Pagination` component consumes — forwarding `pageParam` so the component's
links and the envelope's links stay in step.

```tsx
import { toPaginationProps } from '@lockness/core'
import { Pagination } from '@lockness/ui/components'

function PostList({ result }: { result: OffsetEnvelope<Post> }) {
    return (
        <>
            {/* render result.data ... */}
            <Pagination {...toPaginationProps(result.meta, '/posts')} />
        </>
    )
}
```

### The pure paginator

`paginateOffset` / `paginateCursor` are pure functions (no I/O) — the Drizzle
helper calls them, and you can too if you fetch rows yourself:

```typescript
import { paginateOffset } from '@lockness/core'

const envelope = paginateOffset(rows, {
    total: 57,
    page: 2,
    perPage: 15,
    baseUrl: '/users',
})
```

---

## API Resources

A Resource is an **explicit, opt-in** projection of a model into its wire shape.
It exposes only the fields you name — adding a column to a model never changes
your API output until you add it to the resource. As a safety net, a
never-serialise denylist (`password`, `passwordHash`, `token`, `secret`, `hash`)
is stripped from the output even if a resource names one by mistake.

### A single resource

```typescript
import { Resource } from '@lockness/core'

class UserResource extends Resource<User> {
    override toArray() {
        return {
            id: this.model.id,
            name: this.model.name,
            // this.model.passwordHash is never named → never exposed
        }
    }
}

return c.json(new UserResource(user)) // { id, name }
```

### Collections & pagination

`ResourceCollection` wraps an array of resources. Built from a paginator
envelope with `.paginated()`, it carries the `meta` and `links` through:

```typescript
import { ResourceCollection } from '@lockness/core'

const result = await paginate<User>(this.db.db, users, {
    page,
    perPage,
    baseUrl: '/users',
})

const body = ResourceCollection.paginated(result, (u) => new UserResource(u))
return c.json(body)
// { data: [{ id, name }, ...], meta: {...}, links: {...} }
```

### `make:resource`

Scaffold a resource with the CLI:

```bash
deno task cli make:resource User
# ✅ Resource created at ./app/resource/user_resource.ts
```

The generated stub names an explicit field list (never spreads the whole model),
so a freshly generated resource is opt-in by default — you edit it to name the
fields your API should expose.
