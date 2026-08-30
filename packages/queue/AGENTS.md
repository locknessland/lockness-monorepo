# `@lockness/queue` — agent brief

Background job processing with multiple drivers, plus the `queue:*` commands
registered into `@lockness/cli`. One source file.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/queue` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** `@lockness/cli`

## Where to work

| Concern         | Path                               |
| --------------- | ---------------------------------- |
| Everything      | `mod.ts`                           |
| Command surface | registered through `@lockness/cli` |

## Pitfalls

- A failed job must not silently vanish; check the retry and dead-letter path
  before changing dispatch.
- Single test file for the whole package.

_1 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
