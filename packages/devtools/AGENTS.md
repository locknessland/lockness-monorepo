# `@lockness/devtools` — agent brief

The development debug bar and its dashboard. `collector.ts` gathers per-request
data, `middleware.ts` installs the collector, and `ui/` renders the dashboard.
Mounts at `/_devtools` by default; `basePath` is configurable.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/devtools` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** no package imports it statically; `@lockness/core` loads it
  optionally at boot when the application configures it.
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                        | Path                     |
| ------------------------------ | ------------------------ |
| What gets captured per request | `collector.ts`           |
| A dashboard panel              | `ui/panels/*.tsx`        |
| Toolbar rendering              | `components/toolbar.tsx` |
| Mounting and gating            | `middleware.ts`          |

## Pitfalls

- Everything here must be gated on `APP_ENV !== 'production'`. A panel that
  leaks into production exposes request internals.
- Issue #27 completes the missing panels (events, DI container, sessions). It
  says **extend the existing collector, do not rewrite it**.
- 37 source files but only 3 test files — the least-covered large package.

_37 source files, 3 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
