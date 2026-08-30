# `@lockness/core` — agent brief

The framework itself, and the only package a user application imports directly.
It composes the container, routing, the kernel lifecycle, exception handling and
the JSX view layer, and re-exports the Hono surface through `@lockness/hono`.
Largest package in the workspace.

User-facing documentation: [README.md](README.md) ·
[docs/components.md](docs/components.md) · [docs/compose.md](docs/compose.md) ·
[docs/error-handling.md](docs/error-handling.md) · and 5 more under `docs/`.
This brief does not repeat it.

## Public surface

| Specifier                    | File                  |
| ---------------------------- | --------------------- |
| `@lockness/core`             | `mod.ts`              |
| `@lockness/core/jsx`         | `view/jsx.ts`         |
| `@lockness/core/jsx-runtime` | `view/jsx_runtime.ts` |

## Dependencies

- **Imports:** `@lockness/container`, `@lockness/contract`, `@lockness/events`,
  `@lockness/hono`
- **Loads optionally at runtime:** `@lockness/cache`, `@lockness/devtools`,
  `@lockness/drizzle`, `@lockness/session` via `tryImportOptionalPackage()`.
  These are _not_ static imports and do not appear in the graph above.
- **Imported by:** no other package — it is consumed directly by applications
  (the demo app under `app/` uses it).
- **Test-only:** `@lockness/auth`

## Where to work

| Concern                                  | Path                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| Application assembly                     | `app.ts`                                               |
| Boot sequence and bootstrap steps        | `kernel/bootstrap/steps/*.ts`                          |
| Route discovery and registration         | `routing/*.ts`                                         |
| Mount points and locale-prefixed routing | `routing/mount_manager.ts`, `routing/mount_pattern.ts` |
| Error rendering                          | `exceptions/*.ts`                                      |
| Log sanitisation                         | `logging/sanitize.ts`                                  |
| Optional-package loading                 | `kernel/bootstrap/helpers.ts`                          |
| Rate limiting (`@Throttle`)              | `http/throttle_middleware.ts`                          |

## Pitfalls

- Hard rule #1 applies most sharply here: import Hono through `@lockness/hono`,
  never `hono` directly.
- `cache`, `devtools`, `drizzle` and `session` are loaded by name through
  `tryImportOptionalPackage()`. Renaming one of those packages breaks core at
  runtime with no compile error — grep for the string, not the import.
- Bootstrap steps run in registry order. Adding a step means placing it in
  `kernel/bootstrap/registry.ts`, not just writing the file.
- Mount patterns are built with `constrainedParam()`, never written as literals
  — an unconstrained `:param` swallows sibling routes such as `/.well-known/*`.

_47 source files, 19 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
