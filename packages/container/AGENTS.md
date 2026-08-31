# `@lockness/container` — agent brief

The IoC container: `@Service` registers, `@Inject` resolves, and the container
handles lifetimes. Injection is lazy — a service may hold a reference to one
that holds it back — and only a constructor that re-enters an unfinished
construction raises `CircularDependencyError`. Every other package that does
dependency injection resolves through this one.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/container` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/contract`
- **Imported by:** `@lockness/cache`, `@lockness/core`, `@lockness/drizzle`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                                   | Path            |
| ----------------------------------------- | --------------- |
| Resolution and lifetime rules             | `container.ts`  |
| `@Service` / `@Inject`                    | `decorators.ts` |
| Convenience resolution helpers            | `helpers.ts`    |
| Error types surfaced on failed resolution | `errors.ts`     |

## Pitfalls

- Decorators rely on TC39 Stage 3 semantics; metadata is read at
  class-definition time, so a service registered after first resolution is not
  seen.
- Circular dependencies throw rather than returning a partially built instance —
  do not add a lazy fallback without deciding what a half-built service means.

_6 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
