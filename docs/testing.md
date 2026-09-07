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

## Live-broker integration tests

Most of the suite is hermetic and offline by design. One suite is not: the
realtime bus talks to a real Redis, because the parts of it that matter — the
authoritative presence roster, cross-process eviction, and the durable
revocation index — depend on Redis semantics that an in-process fake can model
_wrongly_ while every check stays green. That happened twice during #276.

The suite is skipped unless you turn it on, so `deno task test` is unchanged.

### Running it

```bash
# A throwaway broker on a port nothing else uses.
docker run -d --rm --name lockness-it-redis -p 63790:6379 redis:7-alpine

LOCKNESS_REDIS_PORT=63790 deno task test:redis

docker stop lockness-it-redis
```

`deno task test:redis` sets the gate for you. Point it wherever you like:

| Variable                     | Default     | Notes                                                                    |
| ---------------------------- | ----------- | ------------------------------------------------------------------------ |
| `LOCKNESS_REDIS_INTEGRATION` | unset       | `1` runs the suite. Set by `deno task test:redis`.                       |
| `LOCKNESS_REDIS_HOST`        | `127.0.0.1` |                                                                          |
| `LOCKNESS_REDIS_PORT`        | `6379`      |                                                                          |
| `LOCKNESS_REDIS_PASSWORD`    | unset       |                                                                          |
| `LOCKNESS_REDIS_DB`          | `0`         | **Not a containment boundary** — see below.                              |
| `LOCKNESS_REDIS_TLS`         | `false`     | `1` to wrap the socket. Required with a password on a non-loopback host. |

**Redis 7.0 or newer.** The realtime driver uses `EXPIRE`'s `NX` and `GT` option
flags, which do not exist before 7.0 and fail silently as no-ops. The preflight
checks the version and fails naming what it found.

### What it does to your broker

Each run mints a namespace of its own — `lockness-it:<random>` — and every key
**and every pub/sub topic** it touches lives under it. Cleanup is `SCAN`-scoped
to that namespace and runs from a `finally`, so a failing run cleans up too.
There is no `FLUSHDB` path and never will be: a test that can wipe a developer's
broker is a test nobody runs twice.

The database index is deliberately **not** the containment boundary. It defaults
to `0` — the database most likely to hold real data — so the namespace rule is
exercised under the realistic condition rather than a comfortable one.

### Two refusals, on purpose

The suite **fails** rather than skipping when the gate is on and no broker
answers. A gated suite that skips silently is how "we have live coverage"
becomes untrue while every check stays green.

It also **refuses** to send `AUTH` in cleartext to a non-loopback host. Set
`LOCKNESS_REDIS_TLS=1` with a password against anything remote.

### The control secret

The realtime control plane is HMAC-authenticated, so the suite needs a
per-deployment secret. It **generates one per run** and no secret literal exists
anywhere in this repository — deliberately. A value published in a framework's
own docs is a value somebody copies into a deployment, and a key in somebody
else's deployment cannot be rotated, because you do not know whose.

For your own deployment, generate one and read it from the environment:

```bash
openssl rand -hex 32   # then: REALTIME_SECRET=... in your environment
```

## Mutation batteries

A test that passes proves the code ran. It does not prove the test would have
noticed had the code been wrong — and those are different claims. A **mutation
battery** checks the second one: it breaks a source file on purpose, re-runs the
suites that should catch it, and reports whether they did.

There are 15 in the repo — 11 in `@lockness/realtime`, 2 in `@lockness/redis`, 2
in `@lockness/contract` — all on one harness at `tests/mutations/harness.ts`,
imported through the `@mutations/` alias declared in `deno.jsonc`.

### Running one

A battery is an executable, not a test file. **`deno test` does not run it**,
which is deliberate: it edits files on disk, so it must never start concurrently
with the suite it mutates.

```bash
deno run -A packages/realtime/tests/mutations/prefix_288.ts
```

Its exit code is the number of **unexpected** survivors, so it is usable in a
script without parsing output. Each package's `AGENTS.md` lists its own
batteries under **Tests**.

### What a row looks like

```ts
{
    label: 'the owned-entry parse splits on the LAST space, not the first',
    file: DRIVER,
    edits: [['entry.indexOf(OWNED_SEP)', 'entry.lastIndexOf(OWNED_SEP)']],
    killedBy: 'a crashed instance’s members are swept',
}
```

`killedBy` is not decoration, and it is the field most worth getting right. It
names a test that **must** be among the failures, so a row cannot pass on a kill
from an unrelated test while the check it was written to prove is absent — the
harness reports that case as `MISATTRIBUTED` rather than as a kill. Where a
mutation trips several tests, the attribution is what makes the row mean the one
thing it claims.

The harness runs a green baseline before mutating anything, takes an atomic
per-file lock, requires every anchor to match **exactly once**, restores the
file on `SIGINT`/`SIGTERM`, and reports a mutant that fails to type-check as
`DEAD` rather than aborting the run.

### `expectSurvival` — a surviving row can be correct

Some mutants cannot change behaviour on any input the public API admits. They
are **equivalent mutants**, and the convention is to record one with its reason,
never to delete the row:

```ts
expectSurvival:
    'Equivalent. The two forms differ only at `sep === 0` — an entry that ' +
    'BEGINS with a space, i.e. an empty channel name, which ' +
    '`ChannelManager.subscribe` refuses at the boundary.',
```

A row carrying `expectSurvival` prints as `SURVIVED*` with its reason and does
not count toward the exit code. Deleting it instead would erase the evidence
that the case was examined, and the next person re-derives it. A guard that is
unreachable from every valid input is the desired state, not a redundancy.

**Write the reason as a claim someone could falsify.** Two rows in this repo
were recorded as equivalent and later shown to be killable once a fixture
existed that could tell the difference — see the self-skip row in
`packages/realtime/tests/redis_broker_integration.test.ts`, which kept all three
of its readings rather than overwriting them.

### Batteries that need a live broker

**Four batteries need one; only three enforce it.** `live_conformance_285.ts`,
`self_skip_310.ts` and `sweep_parse_316.ts` mutate code whose suite only runs
against a real Redis, and they **refuse to start** without one — `Deno.exit(2)`,
not a skip:

```bash
LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=63790 \
  deno run -A packages/realtime/tests/mutations/sweep_parse_316.ts
```

The hard exit is the whole point. Without a broker the mutated suite is
`ignored`, Deno reports `ok`, and the harness reads that as green — so **every
row would report SURVIVED**, and the battery would announce a catastrophe that
is really a missing service. A silent skip here is worse than a failure: it
inverts the result instead of withholding it.

`packages/redis/tests/mutations/subscribe_hardening_248.ts` is the fourth, and
it carries **no gate** — the requirement is stated only in its `@fileoverview`.
Its `#296` rows need a real broker because the defect they mutate is a process
exit, which no in-process double reproduces. Run it broker-less and those rows
give exactly the reading this section warns about. Pass the gate:

```bash
LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=63790 \
  deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts
```

### When a battery earns its place

Not on every change. Write one when the answer to _"would anything have noticed
if this were wrong?"_ is not obvious from reading the suite — a guard whose
absence is silent, an ordering held by a comment, a parse whose alternative
implementation agrees on the fixture you happened to pick. The batteries in this
repo exist because each of those was true at least once.

Two habits worth copying:

- **Prove the mutant is live.** A mutation on a line the suite never reaches
  reads as a result and is not one. If a row is meant to become killable because
  of a change you made, run it **both ways** — against the tree before and after
  — and record both numbers.
- **A negative from a lighter workload is not evidence.** A row that survives
  under one suite may die under another; say which suites you ran.

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
- **One carve-out:** a [mutation battery](#mutation-batteries) lives in
  `tests/mutations/` and is named `<subject>_<issue>.ts` — a plain `.ts`, so
  `deno test` does **not** discover it. That is deliberate: a battery edits
  files on disk, and it must never start concurrently with the suite it mutates.
  `scripts/agents_brief.ts` counts these as their own category rather than as
  source files.

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
