# `@lockness/contract` — agent brief

Shared types, interfaces and decorator declarations with **no runtime
behaviour**. It exists to break dependency cycles: if a type is needed by two
packages that must not know about each other, it belongs here.

It is not dependency-free — it takes Hono's types through the `hono` alias in
its own `deno.json`. Every one of those is an `import type`, so the edge erases
at compile time and the package still emits no runtime import. That distinction
is the invariant, not "imports nothing".

User-facing documentation: [README.md](README.md). This brief does not repeat
it.

## Invariants

- **Every `@lockness/*` import here must be `import type`.** The package takes
  Hono's types through the `hono` alias in its own `deno.json`; because those
  are type-only they erase at compile time and the package emits no runtime
  import. A single value import would turn the framework's cycle-breaker into a
  cycle participant. `deno task deps:analyze` marks the edge _(type-only)_ — if
  that annotation disappears, the invariant broke.
- **Renaming an exported symbol is a breaking change for every importer at
  once**, because the whole workspace ships on one version.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                                                                                                                                                                                                    |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                               | `hono` _(type-only)_                                                                                                                                                                                                                                        |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                                                                                                                                                           |
| Imported by                                    | `auth`, `cache`, `cli`, `container`, `core`, `devtools`, `events`, `logger`, `openapi`, `queue`, `redis`, `session`, `socialite`, `sse`                                                                                                                     |
| **Must never import**                          | `auth`, `auth-provider`, `cache`, `cli`, `container`, `core`, `devtools`, `drizzle`, `events`, `init`, `logger`, `openapi`, `queue`, `redis`, `session`, `socialite`, `sse`, `testing` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| function  | `Cache`, `CacheKey`, `CacheTTL`, `ComposeMiddleware`, `Controller`, `DeclareMiddleware`, `Middleware`, `Static`, `Throttle`, `ThrottleApi`, `ThrottleHeavy`, `ThrottleLogin`, `ThrottleSensitive`, `Use`, `UseMiddleware`, `compose`, `composeMiddleware`, `deregisterDisposable`, `deregisterHealthCheck`, `disposableCount`, `generateRoutesContent`, `generateRoutesFile`, `healthCheckCount`, `isDevelopment`, `isExplicitlyDevelopment`, `isProduction`, `parseTimeWindow`, `registerDisposable`, `registerHealthCheck`, `renderError`, `resolveEnvName`, `safeForLog`, `scanControllers` |
| interface | `CacheContract`, `CacheOptions`, `ContainerContract`, `ContainerRegistration`, `ControllerInfo`, `ControllerMetadata`, `ControllerWithMetadata`, `Disposable`, `DisposableHandle`, `GenerateRoutesResult`, `HealthCheck`, `HealthCheckHandle`, `HealthResult`, `MiddlewareContract`, `Route`, `RouteMetadata`, `RouteOptions`, `StaticOptions`, `ThrottleConfig`, `ThrottleOptions`, `ThrottleStoreContract`                                                                                                                                                                                   |
| typeAlias | `ComposableMiddleware`, `Constructor`, `Context`, `ControllerClass`, `FileExtension`, `MiddlewareClass`, `MiddlewareHandler`, `MiddlewareInput`, `MiddlewareRegistry`, `Next`, `ServiceToken`, `ThrottleKey`, `TimeWindow`, `ValidationTargets`                                                                                                                                                                                                                                                                                                                                                |
| variable  | `CacheServiceToken`, `Delete`, `Get`, `MIDDLEWARE_NAME_KEY`, `Patch`, `Post`, `Put`, `declaredMiddlewares`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

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

## Tests

<!-- generated:tests -->

5 test files for 19 source files:

- `packages/contract/tests/disposables.test.ts`
- `packages/contract/tests/environment.test.ts`
- `packages/contract/tests/health.test.ts`
- `packages/contract/tests/log_sanitize.test.ts`
- `packages/contract/tests/static_decorator.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 5 test files directly —

```bash
deno test -A packages/contract/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
