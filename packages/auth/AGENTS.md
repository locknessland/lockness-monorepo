# `@lockness/auth` — agent brief

Authentication: guards decide _how_ a request proves identity (session cookie,
bearer token, HTTP basic), providers decide _where_ the user record comes from.
The `Authenticator` binds the two and is what `@AuthRequired` / `@AuthGuard`
resolve through. User lookup itself lives in `@lockness/auth-provider`.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/auth` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/contract`, `@lockness/events`, `@lockness/hono`,
  `@lockness/session`
- **Imported by:** `@lockness/auth-provider`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                                    | Path               |
| ------------------------------------------ | ------------------ |
| Guard implementations                      | `guards/*.ts`      |
| Decorators (`@AuthRequired`, `@AuthGuard`) | `decorators.ts`    |
| Guard resolution and the auth context      | `authenticator.ts` |
| Request-time wiring                        | `middleware/*.ts`  |
| Password hashing                           | `password.ts`      |

## Pitfalls

- `initialize_auth_middleware.ts` must run before any guard middleware, or the
  auth context is absent and guards fail closed rather than reporting why.
- Adding a guard means touching three places: the guard class, its entry in the
  authenticator's resolution map, and `types.ts`.

_11 source files, 9 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
