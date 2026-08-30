# `@lockness/logger` — agent brief

Structured logging: levels, transports, formatters and metadata. Standalone, no
Lockness dependencies. One source file, six test files — the inverse of most
packages here.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/logger` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern    | Path     |
| ---------- | -------- |
| Everything | `mod.ts` |

## Pitfalls

- Log values that may contain user input should be passed through
  `@lockness/core`'s `safeForLog()` before they reach a transport; this package
  does not sanitise control characters itself.
- Transports are registered globally. A test that adds one must remove it, or it
  bleeds into the next test.

_1 source files, 6 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
