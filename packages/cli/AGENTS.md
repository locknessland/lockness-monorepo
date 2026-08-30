# `@lockness/cli` — agent brief

The command system behind `./nessy`. `mod.ts` exposes the `Cli` class and the
command registration API; `commands/` holds the built-in commands; `stubs/`
holds the templates `make:*` copies. Other packages register their own commands
into this registry rather than shipping their own binaries.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                | File               |
| ------------------------ | ------------------ |
| `@lockness/cli`          | `mod.ts`           |
| `@lockness/cli/commands` | `core_commands.ts` |

## Dependencies

- **Imports:** `@lockness/contract`, `@lockness/queue`
- **Imported by:** `@lockness/drizzle`, `@lockness/init`, `@lockness/openapi`
- **Demo app:** used by `app/` — a change here is exercised by running it.
- **Test-only:** `@lockness/container`, `@lockness/core`

## Where to work

| Concern                                   | Path                                   |
| ----------------------------------------- | -------------------------------------- |
| Registering a new built-in command        | `core_commands.ts`                     |
| A `make:*` scaffold                       | `commands/make_commands.ts` + `stubs/` |
| Loading commands from installed packages  | `package_loader.ts`                    |
| Stub resolution and variable substitution | `stubs.ts`                             |

## Pitfalls

- A stub added under `stubs/` is not picked up until it is referenced from the
  command that emits it; there is no directory scan.
- `mod.ts` documents `@lockness/drizzle` in a JSDoc `@example`. That is a
  comment, not an import — this package does not depend on drizzle, drizzle
  depends on it.

_10 source files, 10 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
