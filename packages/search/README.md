# @lockness/search

A full-text search abstraction for Lockness — index and query documents over a
pluggable engine, with an in-memory inverted-index driver as the reference
engine. Zero dependencies.

```ts
import { configureSearch, search } from '@lockness/search'

await search('posts').index('1', 'Deno framework release notes')
await search('posts').index('2', 'framework comparison guide')

const hits = await search('posts').query('deno framework', { limit: 10 })
// [{ id: '1', score: 2 }, { id: '2', score: 1 }]
```

## Keeping the index in sync

Indexing is explicit — there is no ORM hook, so your repository owns sync:

```ts
async save(post: Post) {
    await this.repo.save(post)
    await search('posts').index(String(post.id), `${post.title} ${post.body}`)
}
async remove(id: number) {
    await this.repo.delete(id)
    await search('posts').delete(String(id))
}
```

`search('posts').reindex(records)` rebuilds an index from scratch.
`make:searchable Post` scaffolds a `Searchable` projection + a `reindex` helper.

## Safety

The query is **tokenised as data** — never compiled into a regular expression
(no ReDoS) — and query/document sizes are bounded. External engines
(Meilisearch, Typesense) can be plugged behind `SearchDriver`; the memory driver
is the reference implementation.

## Upgrading to v0.5.0

One item. **Migration step:** if your code imports `handleMakeSearchable`, run
`make:searchable` through the CLI instead.

### 1. `handleMakeSearchable` is no longer exported, and `make:searchable` fails non-zero

`handleMakeSearchable`, the handler behind `make:searchable`, was exported from
`@lockness/search`. On a missing or malformed name it printed `❌` itself and
returned `undefined`, so `make:searchable` exited `0` on a failure (#436). It is
now internal: it throws a failure the CLI prints once, and `make:searchable`
exits `1`. `registerSearchCommands` is still exported and is the way to add the
command to a `Cli`; code that called `handleMakeSearchable` directly can
dispatch the command instead (`await cli.dispatch(['make:searchable', 'Post'])`
returns the exit status).
