# `@lockness/openapi` — agent brief

Generates an OpenAPI 3.0 document from route metadata and decorators, plus the
UI that serves it. Reads the route registry rather than a hand-maintained spec.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                   | File         |
| --------------------------- | ------------ |
| `@lockness/openapi`         | `mod.ts`     |
| `@lockness/openapi/install` | `install.ts` |

## Dependencies

- **Imports:** `@lockness/cli`, `@lockness/contract`
- **Imported by:** no other package — it is consumed directly by applications
  (the demo app under `app/` uses it).
- **Test-only:** `@lockness/core`

## Where to work

| Concern                     | Path              |
| --------------------------- | ----------------- |
| Document generation         | `generator.ts`    |
| `@ApiOperation` and friends | `decorator.ts`    |
| Spec-serving UI             | `ui.ts`           |
| `openapi:*` commands        | `cli_commands.ts` |

## Pitfalls

- Generation reads the route registry after discovery. Running it before the
  kernel has booted yields an empty document rather than an error.
- Decorator metadata is optional by design — an undecorated route still appears,
  with a minimal entry. Do not make absence throw.

_7 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
