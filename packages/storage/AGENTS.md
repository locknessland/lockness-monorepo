# `@lockness/storage` — agent brief

File storage abstraction over local and cloud drivers, with a manager that
resolves the configured disk. Standalone; four test files against one source
file.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/storage` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                       | Path                           |
| ----------------------------- | ------------------------------ |
| Everything, including drivers | `mod.ts`                       |
| Driver test double            | `tests/support/mock_driver.ts` |

## Pitfalls

- User-supplied paths reach the local driver. Path traversal is prevented here
  or not at all.
- A new driver should be exercised through `tests/support/mock_driver.ts`'s
  contract shape so behaviour stays comparable across drivers.

_1 source files, 4 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
