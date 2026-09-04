# @lockness/testing

Internal, **test-only** helpers shared across the Lockness monorepo's own test
suites. This package is **never published** and must never be imported by
runtime code — only from a `tests/` directory.

## What's inside

| Helper                | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `testClient(app)`     | Wrap `app.request` with `get`/`post`/`put`/`patch`/`delete`.    |
| `actingAs(user)`      | Middleware setting identity **on the request context only**.    |
| `fakeUser(overrides)` | Build a synthetic `Authenticatable`.                            |
| `FakeTable<Row>`      | In-memory table with `assertHasRow` / `assertMissingRow` / etc. |

## Usage

```ts
import { actingAs, fakeUser, testClient } from '@lockness/testing'

Deno.test('POST /orders as an admin', async () => {
    app.use('*', actingAs(fakeUser({ id: 1, isAdmin: true })))
    const res = await testClient(app).post('/orders', { json: { sku: 'x' } })
    assertEquals(res.status, 201)
})
```

`actingAs` never mints a real session or token and never writes to a real store;
combined with the package being unpublished, it can never become an auth-bypass
primitive in a consumer runtime. Fixtures must use synthetic/placeholder
credentials only — never a real secret.

See [docs/testing.md](../../docs/testing.md) for the full testing guide.
