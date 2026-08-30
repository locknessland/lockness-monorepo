# `@lockness/hono` — agent brief

The pinned Hono re-export layer and the reason hard rule #1 exists. One file per
Hono concern, each re-exporting a vetted subset. Bottom of the dependency graph:
imports nothing, imported by six packages.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                        | File                |
| -------------------------------- | ------------------- |
| `@lockness/hono`                 | `mod.ts`            |
| `@lockness/hono/types`           | `types.ts`          |
| `@lockness/hono/http-exception`  | `http_exception.ts` |
| `@lockness/hono/client`          | `client.ts`         |
| `@lockness/hono/validator`       | `validator.ts`      |
| `@lockness/hono/jsx`             | `jsx.ts`            |
| `@lockness/hono/jsx-runtime`     | `jsx_runtime.ts`    |
| `@lockness/hono/jsx/jsx-runtime` | `jsx_runtime.ts`    |
| `@lockness/hono/jsx-renderer`    | `jsx_renderer.ts`   |
| `@lockness/hono/deno`            | `deno.ts`           |
| `@lockness/hono/html`            | `html.ts`           |
| `@lockness/hono/cookie`          | `cookie.ts`         |
| `@lockness/hono/cors`            | `cors.ts`           |
| `@lockness/hono/zod-validator`   | `zod_validator.ts`  |
| `@lockness/hono/auth`            | `auth.ts`           |
| `@lockness/hono/security`        | `security.ts`       |
| `@lockness/hono/content`         | `content.ts`        |
| `@lockness/hono/request`         | `request.ts`        |
| `@lockness/hono/timing`          | `timing.ts`         |
| `@lockness/hono/routing`         | `routing.ts`        |
| `@lockness/hono/rendering`       | `rendering.ts`      |
| `@lockness/hono/server`          | `server.ts`         |
| `@lockness/hono/network`         | `network.ts`        |

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** `@lockness/auth`, `@lockness/core`, `@lockness/events`,
  `@lockness/session`, `@lockness/ui`, `@lockness/validator`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                     | Path                                                         |
| --------------------------- | ------------------------------------------------------------ |
| Exposing a new Hono API     | the matching `*.ts`, then `mod.ts`, then `deno.json` exports |
| Security middleware surface | `security.ts`                                                |
| JSX runtime plumbing        | `jsx.ts`, `jsx_runtime.ts`, `jsx_renderer.ts`                |

## Pitfalls

- Its README calls it an internal infrastructure package. User applications
  import `@lockness/core`, never this.
- The Hono version is pinned deliberately. Bumping it is a framework-wide
  compatibility decision, not a dependency refresh.
- **Zero tests** for 22 files of re-exports — a dropped export is caught only by
  `packages/core/tests/hono_reexports.test.ts` downstream.

_22 source files, 0 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
