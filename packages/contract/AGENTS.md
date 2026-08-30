# `@lockness/contract` — agent brief

Shared types, interfaces and decorator declarations with **no runtime
behaviour**. It exists to break dependency cycles: eight packages import it and
it imports nothing. If a type is needed by two packages that must not know about
each other, it belongs here.

User-facing documentation: [README.md](README.md). This brief does not repeat
it.

## Public surface

| Specifier                    | File             |
| ---------------------------- | ---------------- |
| `@lockness/contract`         | `mod.ts`         |
| `@lockness/contract/http`    | `http/mod.ts`    |
| `@lockness/contract/routing` | `routing/mod.ts` |

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** `@lockness/auth`, `@lockness/cache`, `@lockness/cli`,
  `@lockness/container`, `@lockness/core`, `@lockness/openapi`

## Where to work

| Concern                          | Path           |
| -------------------------------- | -------------- |
| Cross-package interfaces         | `types.ts`     |
| HTTP-layer contracts             | `http/*.ts`    |
| Routing contracts and decorators | `routing/*.ts` |

## Pitfalls

- **Never add a runtime import here.** This package is the bottom of the graph;
  an import turns a clean tree into a cycle.
- It has no tests and no `docs/` — the types are the documentation, so JSDoc on
  every exported symbol is not optional.
- Renaming an exported type here is a breaking change for eight packages at
  once.

_7 source files, 0 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
