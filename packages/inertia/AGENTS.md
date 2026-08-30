# `@lockness/inertia` — agent brief

Server-side adapter for Inertia.js: version negotiation, partial reloads, shared
props and the response protocol that lets a Lockness controller drive a
client-side SPA without an API layer.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/inertia` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                                | Path            |
| -------------------------------------- | --------------- |
| Response protocol                      | `inertia.ts`    |
| Request detection and version handling | `middleware.ts` |
| Shared and lazy props                  | `props.ts`      |
| Controller-facing helpers              | `helpers.ts`    |

## Pitfalls

- An asset-version mismatch must return 409 with an `X-Inertia-Location` header,
  not a redirect — the client protocol depends on it.
- Lazy props must not be evaluated on a full page visit; only partial reloads
  request them.

_6 source files, 4 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
