# `@lockness/auth-provider` — agent brief

ORM-agnostic user providers for `@lockness/auth`. Each subdirectory is a
separate export path: `base/` holds the abstract classes carrying the shared
logic, `drizzle/` and `kysely/` bind them to a persistence layer. Nothing here
decides authentication policy — that is `@lockness/auth`'s job.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                         | File             |
| --------------------------------- | ---------------- |
| `@lockness/auth-provider`         | `mod.ts`         |
| `@lockness/auth-provider/base`    | `base/mod.ts`    |
| `@lockness/auth-provider/drizzle` | `drizzle/mod.ts` |
| `@lockness/auth-provider/kysely`  | `kysely/mod.ts`  |

## Dependencies

- **Imports:** `@lockness/auth`
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                | Path           |
| ---------------------- | -------------- |
| Shared provider logic  | `base/*.ts`    |
| Drizzle-backed lookups | `drizzle/*.ts` |
| Kysely-backed lookups  | `kysely/*.ts`  |

## Pitfalls

- Each ORM directory is its own export specifier
  (`@lockness/auth-provider/drizzle`). Adding one means adding an entry to
  `deno.json`'s export map, not just a file.
- The `kysely/` directory exists while `@lockness/kysely` itself does not yet
  (see issue #26) — it targets the library directly.
- This package has **no tests**. Anything added here needs its own coverage.

_11 source files, 0 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
