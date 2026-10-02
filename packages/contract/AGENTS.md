# `@lockness/contract` — agent brief

Shared types, interfaces and decorator declarations, plus the few runtime
helpers every layer needs and only the foundation can offer: the log encoder
(`safeForLog`, `renderError`), the routes-file generator, the environment
readers, and `importAppFile` on `@lockness/contract/app-file/internal`, the one
way the framework imports a file of the user's app (#477). It exists to break
dependency cycles: if something is needed by two packages that must not know
about each other, it belongs here.

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

| Direction                                      | Packages                                                                                                                                                                                                                                                                                                               |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                               | `hono` _(type-only)_                                                                                                                                                                                                                                                                                                   |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                                                                                                                                                                                                                      |
| Imported by                                    | `auth`, `cache`, `cli`, `container`, `core`, `crypto`, `devtools`, `drizzle`, `events`, `logger`, `notification`, `openapi`, `queue`, `realtime`, `redis`, `session`, `socialite`, `sse`, `telemetry`                                                                                                                  |
| **Must never import**                          | `auth`, `auth-provider`, `cache`, `cli`, `container`, `core`, `crypto`, `devtools`, `drizzle`, `events`, `init`, `logger`, `mail`, `notification`, `openapi`, `queue`, `realtime`, `redis`, `session`, `socialite`, `sse`, `telemetry`, `testing` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `KeyMaterialError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| function  | `Cache`, `CacheKey`, `CacheTTL`, `ComposeMiddleware`, `Controller`, `DeclareMiddleware`, `Middleware`, `Static`, `Throttle`, `ThrottleApi`, `ThrottleHeavy`, `ThrottleLogin`, `ThrottleSensitive`, `Use`, `UseMiddleware`, `clampPage`, `clampPerPage`, `compose`, `composeMiddleware`, `decodeBase64`, `deregisterDisposable`, `deregisterHealthCheck`, `deriveJsonSchema`, `disposableCount`, `encodeBase64`, `generateAppKey`, `generateRoutesContent`, `generateRoutesFile`, `healthCheckCount`, `isDevelopment`, `isExplicitlyDevelopment`, `isProduction`, `paginateCursor`, `paginateOffset`, `parseTimeWindow`, `readPaginationParams`, `registerDisposable`, `registerHealthCheck`, `renderError`, `resolveEnvName`, `resolveKeyMaterial`, `safeForLog`, `scanControllers`, `toPaginationProps` |
| interface | `CacheContract`, `CacheOptions`, `ContainerContract`, `ContainerRegistration`, `ControllerInfo`, `ControllerMetadata`, `ControllerWithMetadata`, `CursorEnvelope`, `CursorLinks`, `CursorMeta`, `Disposable`, `DisposableHandle`, `GenerateRoutesResult`, `HealthCheck`, `HealthCheckHandle`, `HealthResult`, `JsonSchema`, `MiddlewareContract`, `OffsetEnvelope`, `OffsetLinks`, `OffsetMeta`, `PaginationComponentProps`, `PaginationParams`, `RenderErrorOptions`, `ResourceSchema`, `Route`, `RouteMetadata`, `RouteOptions`, `StaticOptions`, `ThrottleConfig`, `ThrottleOptions`, `ThrottleStoreContract`                                                                                                                                                                                         |
| typeAlias | `ComposableMiddleware`, `Constructor`, `Context`, `ControllerClass`, `FileExtension`, `KeyRejection`, `MiddlewareClass`, `MiddlewareHandler`, `MiddlewareInput`, `MiddlewareRegistry`, `Next`, `PaginationEnvelope`, `PaginationMeta`, `QuerySource`, `ServiceToken`, `ThrottleKey`, `TimeWindow`, `ValidationTargets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| variable  | `CacheServiceToken`, `DEFAULT_CURSOR_PARAM`, `DEFAULT_PAGE_PARAM`, `DEFAULT_PER_PAGE`, `Delete`, `Get`, `KEY_BYTES`, `KEY_PREFIX`, `MAX_PER_PAGE`, `MIDDLEWARE_NAME_KEY`, `Patch`, `Post`, `Put`, `REJECTED_KEYS`, `declaredMiddlewares`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                          | Path           |
| -------------------------------- | -------------- |
| Cross-package interfaces         | `types.ts`     |
| HTTP-layer contracts             | `http/*.ts`    |
| Routing contracts and decorators | `routing/*.ts` |

## Pitfalls

- **Never add a runtime `@lockness/*` import here.** This package is the bottom
  of the graph; such an import turns a clean tree into a cycle. `@std/*` value
  imports are fine — `app_file_url.ts` and `routing/generator.ts` use
  `@std/path`.
- **`core` re-exports this root with `export *`, so a runtime helper meant only
  for packages goes on an `/internal` entry point, never in `mod.ts`.** Anything
  in `mod.ts` reaches every app through `@lockness/core`.
- **Every app-file import of the framework goes through `importAppFile`**, from
  `@lockness/contract/app-file/internal` (`app_file.ts`). Its one `import()` is
  the only app-file site `deps.policy.jsonc` inventories, and the
  `lockness/app-file-specifier` lint rule (`scripts/lint/`) rejects a hand-built
  specifier anywhere else. It swallows nothing: whether a missing file is normal
  and how a broken one is reported belong to each caller. It translates exactly
  one failure — a file that does not compile or link becomes an
  `AppFileCompileError` (file relative to the root, line, column, **no
  `cause`**), because the runtime's message quotes the failing source line
  (#478). Everything else, "Module not found" included, is rethrown untouched.
- **Which `name=value` pairs carry a credential is decided once, in
  `logging/credential_params.ts`** (on `@lockness/contract/logging/internal`).
  `renderError` replaces such a value by shape; drizzle's `probe()` holds the
  DSN's values and withholds a message that echoes one (#438). Add a stem there,
  never a second list beside a caller — two lists drift on the first vendor name
  somebody adds to only one.
- **What the `renderError` net does not see.** It is a shape rule for
  `name=value` (quoted values, spaces around `=` and ANSI-coloured names
  included). It does not see a JSON `"token":"…"`, a header- or YAML-style
  `name: value`, an `Authorization: Bearer …` header, a bare token with no name,
  a doubly encoded separator (`%253D`), or a session id under a name it does not
  know. Those need a source-side fix where the value is known; do not widen the
  net to guess at them.
- **A compile failure is recognised by its message shape, never by class or
  `code`** (`logging/compile_diagnostic.ts`). Deno reports a parse failure as a
  `TypeError` with `ERR_MODULE_NOT_FOUND`, the same pair "Module not found"
  carries. If Deno's format changes, the real-file tests in
  `tests/compile_diagnostic.test.ts` are what notice. The V8 phrases the net
  also keys on (`V8_COMPILE_PHRASES`) were measured on Deno 2.9.6 and are V8's
  wording, not a contract: re-measure them on every Deno upgrade.
- It has tests (`tests/`) but no `docs/` — JSDoc is the documentation, so it is
  not optional on any exported symbol.
- Renaming an exported type here is a breaking change for eight packages at
  once.

## Tests

<!-- generated:tests -->

11 test files for 30 source files:

- `packages/contract/tests/app_file.test.ts`
- `packages/contract/tests/compile_diagnostic.test.ts`
- `packages/contract/tests/crypto_key.test.ts`
- `packages/contract/tests/disposables.test.ts`
- `packages/contract/tests/environment.test.ts`
- `packages/contract/tests/health.test.ts`
- `packages/contract/tests/log_sanitize.test.ts`
- `packages/contract/tests/pagination.test.ts`
- `packages/contract/tests/query_credentials.test.ts`
- `packages/contract/tests/resource_derive.test.ts`
- `packages/contract/tests/static_decorator.test.ts`

3 mutation batteries — **`deno test` does not run these.** Each is an executable
that mutates a source file and re-runs the suites that should notice. Run them
with `deno task mutate` (all of them, one at a time) or
`deno task mutate <name>` (one); nightly CI runs the full sweep. See
[testing.md](../../docs/testing.md#mutation-batteries).

- `packages/contract/tests/mutations/bidi_292.ts`
- `packages/contract/tests/mutations/dsn_redaction_301_303.ts`
- `packages/contract/tests/mutations/query_credentials_478.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 11 test files directly —

```bash
deno test -A packages/contract/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
