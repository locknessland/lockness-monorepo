# `@lockness/init` — agent brief

Project scaffolding: `lockness init` materialises a new application from the
templates under `stubs/`. One source file, all the substance is in the stub
tree.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier        | File     |
| ---------------- | -------- |
| `@lockness/init` | `mod.ts` |

## Dependencies

- **Imports:** `@lockness/cli`
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                 | Path            |
| ----------------------- | --------------- |
| Scaffolding flow        | `mod.ts`        |
| Generated project files | `stubs/init/**` |

## Pitfalls

- Stubs are the shape of every new project. A convention changed in `packages/`
  and not mirrored here ships stale to every new user.
- `tests/consistency.test.ts` guards stub/framework drift — read it before
  changing a stub, it is the contract.
- The starter kits (#98, #100-#102) will extend this package, not replace it.

_1 source files, 2 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
