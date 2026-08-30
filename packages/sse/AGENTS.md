# `@lockness/sse` — agent brief

Server-Sent Events: channel registry, connection manager, wire formatter and the
request handler. Standalone.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/sse` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                          | Path           |
| -------------------------------- | -------------- |
| Connection lifecycle             | `manager.ts`   |
| Channel membership and broadcast | `channel.ts`   |
| Wire format                      | `formatter.ts` |
| Request entry point              | `handler.ts`   |

## Pitfalls

- Every disconnect path must remove the connection from the manager, or the
  process leaks handles under reconnect churn.
- The wire format is whitespace-sensitive — an event needs its terminating blank
  line or the client buffers it forever.

_6 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
