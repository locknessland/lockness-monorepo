# `@lockness/cache` — agent brief

Multi-driver cache with a tagging layer. `store.ts` holds driver-independent
behaviour (tags, TTL parsing, `remember`), drivers under `drivers/` hold the
backend calls. The public API is imperative; the declarative `@Cached` decorator
is issue #93 and does not exist yet.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                    |
| :--------------------------------------------- | :-------------------------------------------------------------------------- |
| Imports (static)                               | `container`, `contract`                                                     |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                           |
| Imported by                                    | `core`                                                                      |
| **Must never import**                          | `core` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                      |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `CacheStore`, `DenoKvCacheDriver`, `MemoryCacheDriver`, `RedisCacheDriver`                                                                                                                                                                                                   |
| function  | `CacheInvalidate`, `Cached`, `add`, `cache`, `configureCache`, `decrement`, `flush`, `flushByTag`, `forever`, `forget`, `forgetByTag`, `get`, `getCacheConfig`, `has`, `increment`, `many`, `pull`, `put`, `putMany`, `remember`, `rememberForever`, `set`, `setCacheDriver` |
| interface | `CacheConfig`, `CacheDriver`, `CacheInvalidateOptions`, `CacheItem`, `CachedOptions`, `RedisCacheDriverOptions`, `RedisClient`                                                                                                                                               |
| typeAlias | `CacheTtl`                                                                                                                                                                                                                                                                   |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                                          | Path           |
| ------------------------------------------------ | -------------- |
| Public API (`get`/`set`/`remember`/`flushByTag`) | `api.ts`       |
| Driver-independent logic                         | `store.ts`     |
| A backend (memory, Deno KV, Redis)               | `drivers/*.ts` |
| Configuration shape                              | `config.ts`    |

## Pitfalls

- A new driver must implement tag support or explicitly reject it — `flushByTag`
  silently no-ops on a driver that ignores tags.
- `redis.test.ts` needs a live Redis; it is skipped when unreachable, so a green
  local run does not mean the Redis driver was exercised.

## Tests

<!-- generated:tests -->

6 test files for 10 source files:

- `packages/cache/tests/advanced.test.ts`
- `packages/cache/tests/basic.test.ts`
- `packages/cache/tests/decorators.test.ts`
- `packages/cache/tests/features.test.ts`
- `packages/cache/tests/redis.test.ts`
- `packages/cache/tests/shutdown.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 6 test files directly —

```bash
deno test -A packages/cache/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
