# `@lockness/session` — agent brief

Session management across four drivers (cookie, memory, Deno KV, Redis).
`store.ts` holds driver-independent behaviour, `middleware.ts` attaches the
session to the request context. `@lockness/auth`'s session guard reads through
this.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/session` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/hono`
- **Imported by:** `@lockness/auth`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                                 | Path            |
| --------------------------------------- | --------------- |
| Driver-independent behaviour            | `store.ts`      |
| A backend                               | `drivers/*.ts`  |
| Request attachment and cookie lifecycle | `middleware.ts` |
| Configuration shape                     | `config.ts`     |

## Pitfalls

- The cookie driver stores state client-side: it has a hard size limit and must
  never hold anything that is not signed.
- Session middleware must run before auth middleware, or the session guard finds
  no session and fails closed.

_11 source files, 3 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
