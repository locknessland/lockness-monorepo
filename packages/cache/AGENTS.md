# `@lockness/cache` — agent brief

Multi-driver cache with a tagging layer. `store.ts` holds driver-independent
behaviour (tags, TTL parsing, `remember`), drivers under `drivers/` hold the
backend calls. The public API is imperative; the declarative `@Cached` decorator
is issue #93 and does not exist yet.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/cache` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/container`, `@lockness/contract`
- **Imported by:** no package imports it statically; `@lockness/core` loads it
  optionally at boot when the application configures it.

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

_9 source files, 4 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
