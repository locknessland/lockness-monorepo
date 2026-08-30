# `@lockness/mail` — agent brief

Email sending with pluggable drivers and a fluent message builder. Standalone
and deliberately small: one source file, one test file.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/mail` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern    | Path     |
| ---------- | -------- |
| Everything | `mod.ts` |

## Pitfalls

- The default driver in a test environment must not send. Verify the driver is a
  test double before asserting delivery.
- One test file for the whole package — new drivers arrive uncovered unless
  coverage is added deliberately.

_1 source files, 1 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
