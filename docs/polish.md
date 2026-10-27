# Polish: feature flags, search, mail depth

Three independent capabilities added in one epic (#239).

## Feature flags — `@lockness/features`

```ts
import { configureFeatures, features } from '@lockness/features'

configureFeatures({
    flags: { 'new-ui': { rollout: 25 }, beta: true },
})
if (await features().active('new-ui', user)) { /* stable per user */ }
await features().activate('new-ui', user) // override
```

A flag is a boolean, a `{ rollout: 0..100 }` (deterministic per scope), or a
resolver. Resolution: override → definition → default off, **fail-closed** on
error. The scope is app-supplied; for an access/entitlement flag pass a
**server-verified** identity — flags are not an authorization boundary.
`make:flag <name>` scaffolds a definition. See
[@lockness/features](../packages/features/README.md).

## Full-text search — `@lockness/search`

```ts
import { search } from '@lockness/search'

await search('posts').index(String(post.id), `${post.title} ${post.body}`)
const hits = await search('posts').query('deno framework', { limit: 10 })
```

A Scout-style facade over a pluggable `SearchDriver`; the memory driver is a
tokenised inverted index. The query is tokenised **as data** (never a regex),
bounded. Indexing is explicit — the app's repository keeps the index in sync
(`index()`/`delete()` on save/delete; `reindex()` rebuilds). `make:searchable`
scaffolds the pattern. See [@lockness/search](../packages/search/README.md).

## Mail depth — `@lockness/mail`

**Markdown mailables:**

```ts
import { Mailable } from '@lockness/mail'

class Welcome extends Mailable {
    constructor(private readonly to: string) {
        super()
    }
    build() {
        return { to: this.to, subject: 'Welcome', markdown: '# Hi there' }
    }
}
await new Welcome('a@b.c').send() // markdown → HTML via @lockness/markdown (soft)
```

**Queued mail** — identifiers only, rendered in the worker (never a rendered
body at rest):

```ts
import {
    configureMailQueue,
    handleMailJob,
    queueMailable,
    registerMailable,
} from '@lockness/mail'
import { dispatch } from '@lockness/queue'

configureMailQueue((job) => dispatch('mail', job)) // wire your queue
registerMailable('Welcome', (p) => new Welcome((p as { to: string }).to))
await queueMailable(new Welcome('a@b.c'))
// in the worker: await handleMailJob(job)
```

Rehydration resolves the mailable **only through the allowlist registry** — an
unregistered name is rejected without instantiation.

**Dev preview** — opt-in, production fail-closed, bodies served only in a
sandboxed iframe:

```ts
import { enableMailPreview, mailPreviewHandler } from '@lockness/mail'

enableMailPreview() // no effect in production
app.all('/_mail', (c) => mailPreviewHandler()(c.req.raw)) // mount behind your auth gate
```

`make:mail <Name>` scaffolds a `Mailable`. See
[@lockness/mail](../packages/mail/README.md).
