# `@lockness/upgrade` — agent brief

Automated upgrade tool: resolves the latest published versions and rewrites a
project's `@lockness/*` specifiers. Standalone, and the one package whose blast
radius is other people's repositories.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/upgrade` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                              | Path                 |
| ------------------------------------ | -------------------- |
| Upgrade orchestration                | `upgrader.ts`        |
| Version resolution from the registry | `version_fetcher.ts` |
| Public entry                         | `mod.ts`             |

## Pitfalls

- It edits user projects. Every change needs a dry-run path and must be
  idempotent.
- Hard rule #6: it must never hand-edit `deno.lock`; it triggers a Deno command
  that regenerates it.
- Version resolution reads JSR at runtime; a network failure must degrade to 'no
  upgrade' rather than to a wrong pin.

_4 source files, 3 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
