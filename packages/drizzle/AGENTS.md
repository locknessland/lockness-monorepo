# `@lockness/drizzle` — agent brief

Drizzle ORM integration for PostgreSQL: the `Database` service, the `db:*` and
`make:*` commands, and the stubs they emit. Thin by design — three source files;
the ORM does the work.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                    | File              |
| ---------------------------- | ----------------- |
| `@lockness/drizzle`          | `mod.ts`          |
| `@lockness/drizzle/commands` | `cli_commands.ts` |
| `@lockness/drizzle/install`  | `install.ts`      |

## Dependencies

- **Imports:** `@lockness/cli`, `@lockness/container`
- **Imported by:** no package imports it statically; `@lockness/core` loads it
  optionally at boot when the application configures it.
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                                     | Path              |
| ------------------------------------------- | ----------------- |
| Service and public API                      | `mod.ts`          |
| `db:migrate` / `db:rollback` / `make:model` | `cli_commands.ts` |
| Project bootstrap                           | `install.ts`      |
| Generated file templates                    | `stubs/`          |

## Pitfalls

- This package has **no tests** despite owning migration commands.
- It imports `@lockness/cli` at runtime (`install.ts`), so it must not be
  imported from `cli` in return — that would close a cycle.
- Issue #26 proposes a Kysely sibling; it must not deprecate or reshape this
  one.

_3 source files, 0 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
