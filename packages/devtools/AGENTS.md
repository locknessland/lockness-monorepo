# `@lockness/devtools` — agent brief

The development debug bar and its dashboard. `collector.ts` gathers per-request
data, `middleware.ts` installs the collector, and `ui/` renders the dashboard.
Mounts at `/_devtools` by default; `basePath` is configurable.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                    |
| :--------------------------------------------- | :-------------------------------------------------------------------------- |
| Imports (static)                               | `contract`, `events`, `hono`, `session` _(type-only)_                       |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                           |
| Imported by                                    | `core`                                                                      |
| **Must never import**                          | `core` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                             |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `ComponentDependencyAnalyzer`                                                                                                                                                                                                       |
| function  | `collectAppRoutes`, `collectRoutes`, `devtoolsMiddleware`, `enableDevtools`, `log`, `trackJob`, `trackMail`, `trackQuery`                                                                                                           |
| interface | `ComponentNode`, `DeprecationEntry`, `DevtoolsConfig`, `DevtoolsData`, `EventInfo`, `HonoProvider`, `LogEntry`, `MailInfo`, `PerformanceMetric`, `QueueJob`, `RequestInfo`, `RouteInfo`, `RouteProvider`, `SQLQuery`, `SessionData` |
| typeAlias | `HttpMethod`, `JobStatus`, `LogLevel`, `MailStatus`, `MetricType`                                                                                                                                                                   |
| variable  | `collector`                                                                                                                                                                                                                         |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

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
- The collector routes are **authorization-gated** (#161): `authorizeDevtools`
  in `gate.ts` is the single decider
  (`authorize › token › default loopback
  posture`), and `enableDevtools` wires
  it on **both** `basePath` and `basePath + '/*'` so the bare `/_devtools`
  dashboard is covered. Do not add a credential/IP check anywhere else, and do
  not gate only `/*`.
- Issue #27 completes the missing panels (events, DI container, sessions). It
  says **extend the existing collector, do not rewrite it**.
- 37 source files but only 3 test files — the least-covered large package.

## Tests

<!-- generated:tests -->

6 test files for 42 source files:

- `packages/devtools/tests/collector.test.ts`
- `packages/devtools/tests/debug_panels.test.ts`
- `packages/devtools/tests/gate.test.ts`
- `packages/devtools/tests/gate_routes.test.ts`
- `packages/devtools/tests/helpers.test.ts`
- `packages/devtools/tests/toolbar.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 6 test files directly —

```bash
deno test -A packages/devtools/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
