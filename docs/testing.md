# Testing Best Practices for Lockness

## Overview

Lockness uses deterministic time control and in-memory mocks to keep tests fast,
reliable, and hermetic. Follow these guidelines when writing tests for the
framework.

## Time Control with FakeTime

### The Problem

Traditional time-based tests use real delays with `setTimeout`:

```typescript
// ❌ Slow and non-deterministic
Deno.test('session expiration', async () => {
    await driver.write('session', { id: 1 }, 1) // 1 second TTL
    await new Promise((resolve) => setTimeout(resolve, 1100)) // Wait 1.1 seconds
    assertEquals(await driver.read('session'), null)
})
```

This test takes over 1 second to run and can be flaky due to timing issues.

### The Solution

Use `FakeTime` from `@std/testing/time` to replace real time delays with instant
time manipulation:

```typescript
// ✅ Fast and deterministic
import { FakeTime } from '@std/testing/time'

Deno.test('session expiration', async () => {
    using time = new FakeTime()

    await driver.write('session', { id: 1 }, 1) // 1 second TTL
    time.tick(1100) // Advance 1.1 seconds instantly

    assertEquals(await driver.read('session'), null)
})
```

This test completes in milliseconds with no race conditions.

### When to Use FakeTime

- Testing TTL/expiration logic (sessions, cache)
- Testing time-based delays or intervals
- Any test with `setTimeout`, `setInterval`, or `Date.now()`
- Testing scheduled jobs or queue delays

### Benefits

- Tests run in milliseconds instead of seconds
- No race conditions from real timers
- Deterministic test execution
- Parallel-safe (no timer conflicts)

## In-Memory Storage Mocks

### The Problem

Traditional storage tests write to the filesystem:

```typescript
// ❌ Slow and creates side effects
Deno.test('storage operations', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('file.txt', 'content')
    assertEquals(await driver.get('file.txt'), 'content')

    // Cleanup required
    await driver.delete('file.txt')
})
```

This test:

- Writes to disk (slow)
- Creates `tmp/` directories (filesystem pollution)
- Requires cleanup
- Can't run in parallel safely

### The Solution

Use in-memory mock drivers that implement the same interface:

```typescript
// ✅ Fast and hermetic
import { createMockStorage } from '@lockness/storage/tests/support/mock_driver.ts'

Deno.test('storage operations', async () => {
    const driver = createMockStorage()

    await driver.put('file.txt', 'content')
    assertEquals(await driver.get('file.txt'), 'content')

    // No cleanup needed - all in memory
})
```

### When to Use Memory Mocks

- Testing storage drivers (local, S3, R2)
- Testing file operations (put, get, delete, copy, move)
- Testing storage-dependent services
- Any test that writes to disk

### Benefits

- Tests run 10-100x faster (no disk I/O)
- No filesystem pollution (no `tmp/` directories)
- Parallel-safe (no file conflicts)
- Hermetic (no side effects)
- No cleanup required

## Performance Guidelines

### Avoid Real Delays

❌ **Never** use `setTimeout` with actual time in tests:

```typescript
// Bad
await new Promise((resolve) => setTimeout(resolve, 1000))
```

✅ Use `FakeTime` instead:

```typescript
// Good
using time = new FakeTime()
time.tick(1000)
```

### Minimize Micro-delays

If you must use real delays (e.g., for event loop processing), keep them
minimal:

```typescript
// Before
await new Promise((resolve) => setTimeout(resolve, 10))

// After
await new Promise((resolve) => setTimeout(resolve, 1))
```

### Use Memory Drivers

❌ **Avoid** filesystem I/O in unit tests:

```typescript
// Bad
const driver = new LocalStorageDriver({ driver: 'local', root: './tmp' })
```

✅ Use in-memory mocks:

```typescript
// Good
const driver = createMockStorage()
```

### Keep Tests Hermetic

Tests should not create side effects:

- No files written to disk
- No network calls to external services
- No shared state between tests
- No environment variable modifications

## Test Suite Performance Targets

Target metrics for the full test suite:

| Package   | Before  | Target    | Improvement   |
| --------- | ------- | --------- | ------------- |
| Session   | 3s      | < 1s      | 3x faster     |
| Cache     | 2s      | < 1s      | 2x faster     |
| Storage   | 5s      | < 2s      | 2.5x faster   |
| Events    | 1s      | < 0.5s    | 2x faster     |
| **Total** | **87s** | **< 30s** | **3x faster** |

## Examples

### Session Expiration Test

```typescript
import { FakeTime } from '@std/testing/time'
import { MemorySessionDriver } from '@lockness/session'

Deno.test('MemorySessionDriver - session expiration', async () => {
    using time = new FakeTime()
    const driver = new MemorySessionDriver()

    await driver.write('expire-session', { userId: 789 }, 1) // 1 second
    time.tick(1100) // Advance 1.1 seconds

    const retrieved = await driver.read('expire-session')
    assertEquals(retrieved, null)
})
```

### Cache TTL Test

```typescript
import { FakeTime } from '@std/testing/time'
import { get, set } from '@lockness/cache'

Deno.test('cache TTL causes expiration', async () => {
    using time = new FakeTime()

    await set('expiring', 'value', 0.1) // 100ms TTL
    assertEquals(await get('expiring'), 'value')

    time.tick(150) // Advance 150ms
    assertEquals(await get('expiring'), null)
})
```

### Storage Mock Test

```typescript
import { createMockStorage } from '@lockness/storage/tests/support/mock_driver.ts'

Deno.test('storage copy operation', async () => {
    const driver = createMockStorage()

    await driver.put('source.txt', 'Copy me')
    await driver.copy('source.txt', 'destination.txt')

    const source = await driver.get('source.txt')
    const dest = await driver.get('destination.txt')

    assertEquals(source, 'Copy me')
    assertEquals(dest, 'Copy me')
})
```

## Integration vs Unit Tests

### Unit Tests (Use Mocks)

Unit tests should be fast and hermetic:

- Use `FakeTime` for time control
- Use in-memory mocks for storage
- Mock external dependencies
- Run in < 100ms each

### Integration Tests (Use Real Drivers)

Integration tests validate actual behavior:

- Use real database connections
- Use real storage drivers (S3, R2, Local)
- Test with real external services
- Slower but validate end-to-end behavior

## The `@lockness/testing` harness

`@lockness/testing` is an **internal, test-only** workspace package. It is
**never published** and must never be imported by runtime code — only from a
`tests/` directory. It bundles the helpers the framework's own tests share.

### HTTP test client

`testClient(app)` wraps `app.request` with `get` / `post` / `put` / `patch` /
`delete` helpers; a `json` body is serialised and its content-type set for you.

```typescript
import { testClient } from '@lockness/testing'

Deno.test('GET /ping', async () => {
    const res = await testClient(app).get('/ping')
    assertEquals(res.status, 200)
})

Deno.test('POST /echo', async () => {
    const res = await testClient(app).post('/echo', { json: { a: 1 } })
    assertEquals(await res.json(), { a: 1 })
})
```

New tests should use `testClient`; existing hand-rolled `app.request` sites are
migrated opportunistically.

### Acting as a user

`actingAs(user)` is middleware that sets the identity **only on the request
context** (`c.set('auth', { user })`). It never mints a real session or token
and never writes to a session/user store — and because the package is
unpublished, it never reaches a consumer runtime. Pair it with
`fakeUser(overrides)`.

```typescript
import { actingAs, fakeUser } from '@lockness/testing'

app.use('*', actingAs(fakeUser({ id: 1, isAdmin: true })))
```

### Database assertions

`FakeTable<Row>` is an in-memory table with `insert`, `assertHasRow`,
`assertMissingRow` and `assertRowCount` — assert persistence without a database.

## Test file naming

- One convention: **`*.test.ts`** (or `*.test.tsx` for JSX). `deno test`
  discovers these; `_test.ts` is legacy and no longer used under `packages/`.
- Put tests in the package's `tests/` directory. `scripts/deps_analyzer.ts`
  excludes `tests/` from the measured dependency graph, so a `tests/`-only
  import (such as `@lockness/testing`) creates no runtime dependency edge.

## Sanitizers and fixtures

- **Keep Deno's sanitizers on.** Never disable the resource / op / exit
  sanitizers to paper over a leak — close every KV handle, listener and timer
  the test opens. Use `deno task test:leaks` (`--trace-leaks`) to locate a
  leak's origin.
- **Synthetic credentials only.** Fixtures use placeholder secrets and
  connection strings — never a real password, token or DSN. The pre-commit
  secret scan is the backstop, not the policy.
- **Mock at the seam.** Prefer an injected fake (a command-runner, a
  seeder-loader, a fake connection) over reaching into internals; the code under
  test should expose the seam.

## Contributing

When adding new tests to the Lockness framework:

1. ✅ Use `FakeTime` for time-based tests
2. ✅ Use in-memory mocks for storage tests
3. ✅ Keep tests hermetic (no side effects)
4. ✅ Target < 100ms per test
5. ✅ Add tests to the `tests/` directory with `*.test.ts` naming
6. ✅ Reuse `@lockness/testing` (`testClient`, `actingAs`, `FakeTable`) — never
   import it from runtime code
7. ✅ Use synthetic/placeholder credentials only — never a real secret
8. ✅ Run `deno task test` before committing

## References

- [@std/testing/time](https://jsr.io/@std/testing/doc/time/~/FakeTime) -
  FakeTime API
- [GEMINI.md](/GEMINI.md#-testing-best-practices) - Full testing guidelines
- [packages/storage/tests/support/mock_driver.ts](/packages/storage/tests/support/mock_driver.ts) -
  Storage mock implementation
