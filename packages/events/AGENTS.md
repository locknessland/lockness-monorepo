# `@lockness/events` — agent brief

The event system: class-based events, a dispatcher, listener discovery through
decorators, and testing helpers (`fake()`, `EventBuffer`). `@lockness/core`
registers discovered listeners into the global dispatcher during boot.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/events` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/hono`
- **Imported by:** `@lockness/auth`, `@lockness/core`

## Where to work

| Concern                    | Path                   |
| -------------------------- | ---------------------- |
| Dispatch semantics         | `dispatcher.ts`        |
| `@Listener` and friends    | `decorators.ts`        |
| Listener registry          | `listener_registry.ts` |
| Framework lifecycle events | `kernel_events.ts`     |
| Test doubles               | `testing.ts`           |

## Pitfalls

- Issue #91 replaces the in-house emitter with Emittery behind an `EventEngine`
  adapter. Do not build new public surface on the current emitter internals.
- Listener priority is honoured through sorted registration order, not a heap —
  registering after dispatch has started does not re-sort.
- No public introspection API exists yet; issue #90 depends on one.

_7 source files, 2 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
