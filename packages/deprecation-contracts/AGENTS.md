# `@lockness/deprecation-contracts` — agent brief

A convention for announcing deprecations: `trigger.ts` raises a notice,
`collector.ts` accumulates them, `formatter.ts` renders them. Standalone — it
imports no other Lockness package, so anything can depend on it.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                                 | File         |
| ----------------------------------------- | ------------ |
| `@lockness/deprecation-contracts`         | `mod.ts`     |
| `@lockness/deprecation-contracts/install` | `install.ts` |

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                            | Path            |
| ---------------------------------- | --------------- |
| Raising a deprecation              | `trigger.ts`    |
| Decorator form                     | `decorators.ts` |
| Aggregation for the devtools panel | `collector.ts`  |
| Project installer                  | `install.ts`    |

## Pitfalls

- Notices are collected in memory per process; a long-running server accumulates
  them indefinitely unless the collector is cleared.
- The devtools deprecation panel reads this collector. Changing the record shape
  breaks `packages/devtools/ui/panels/Deprecations.tsx` silently.

_9 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
