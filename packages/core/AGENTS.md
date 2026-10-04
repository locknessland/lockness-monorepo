# `@lockness/core` — agent brief

The framework itself, and the only package a user application imports directly.
It composes the container, routing, the kernel lifecycle, exception handling and
the JSX view layer, and re-exports the Hono surface through `@lockness/hono`.
Largest package in the workspace.

User-facing documentation: [README.md](README.md) ·
[docs/components.md](docs/components.md) · [docs/compose.md](docs/compose.md) ·
[docs/error-handling.md](docs/error-handling.md) · and 5 more under `docs/`.
This brief does not repeat it.

## Invariants

- **Core imports an optional package only when the kernel names it, and a
  configured package that does not resolve refuses the boot (#505).** Every such
  import goes through `kernel/bootstrap/optional_packages.ts`:
  `loadConfiguredPackage(config, '<key>', importModule)` for a kernel key in
  `OPTIONAL_FEATURES`, `importRequiredPackage` for a setting that is not a key
  (`schedulerLock.driver 'redis'`). Unset key: nothing imported, nothing
  printed. Set and unresolvable: `MissingOptionalPackageError`. There is no
  "warn and skip" — that line hid a kit shipping `cache` undeclared and a redis
  lock that never installed. The specifier is a _string argument_, so **no
  static tool can see the edge**; `deps.policy.jsonc` declares them under
  `soft`, and `scripts/core_soft_policy_test.ts` fails when that list and
  `OPTIONAL_FEATURES` (plus `redis`) disagree.
- **A hard dependency is imported statically, never through the loader.** The
  loader's variable specifier resolves against the _application's_ import map;
  `@lockness/events` went through it and `KernelBooted` never fired in a
  JSR-installed app (#505).
- **A boot discovery step tolerates only an absent directory.** The listeners
  and schedules steps catch `Deno.errors.NotFound` from discovery and rethrow
  everything else, so a file that cannot load refuses the boot (#518).
  `discoverListeners` wraps each import failure in a `ListenerLoadError` naming
  the file, because a module can throw `NotFound` itself while it evaluates and
  would otherwise pass for an absent directory.
- **A soft dependency is never declared in `deno.json`.** The consuming
  application installs it, or the feature stays off. Declaring one would make an
  optional package mandatory for every consumer.
- **Core publishes no `.tsx`.** A JSR `.tsx` is transpiled with the consuming
  app's `jsxImportSource` under `"jsx": "precompile"`, so one `.tsx` here broke
  every app without JSX at load (#470). Markup is written with `html` / `raw`
  from `@lockness/hono` (see `exceptions/default_view.ts`); `publish:check`
  refuses a `.tsx` without a `jsx` entry in `deps.policy.jsonc`.
- **Bootstrap steps are ordered, and the order is load-bearing.** Controllers
  are built at step 550; anything that needs them must run after it.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                                                                                                |
| :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                          | `container`, `contract`, `crypto`, `events`, `hono`, `scheduler`                                                        |
| Imports (soft, loaded at runtime by name) | `cache`, `container`, `deprecation-contracts`, `devtools`, `drizzle`, `i18n`, `logger`, `redis`, `session`, `telemetry` |
| Imported by                               | —                                                                                                                       |
| **Must never import**                     | nothing — no package depends on this one                                                                                |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `App`, `BaseEvent`, `CircularDependencyError`, `Container`, `ControllerExecuting`, `EventBuffer`, `EventDispatcher`, `EventEmitter`, `ExceptionOccurred`, `HTTPException`, `Hono`, `HonoRequest`, `KernelBooted`, `KernelTerminating`, `KeyMaterialError`, `MissingOptionalPackageError`, `RequestCompleted`, `RequestStarted`, `Resource`, `ResourceCollection`, `ResponsePrepared`, `Scheduler`, `ServiceNotFoundError`, `SignedUrlError`, `SignedUrlMiddleware`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| function  | `Cache`, `CacheKey`, `CacheTTL`, `ComposeMiddleware`, `Controller`, `DeclareGlobalMiddleware`, `DeclareMiddleware`, `Inject`, `Kernel`, `Listener`, `Middleware`, `OnBoot`, `OnShutdown`, `Schedule`, `Service`, `Static`, `Throttle`, `ThrottleApi`, `ThrottleHeavy`, `ThrottleLogin`, `ThrottleSensitive`, `Use`, `UseMiddleware`, `asset`, `bind`, `canonicalise`, `clampPage`, `clampPerPage`, `codeConstraint`, `compose`, `composeMiddleware`, `configureEventDispatcher`, `constrainedParam`, `createApp`, `createContainer`, `createEventQueue`, `debugLog`, `decodeBase64`, `defaultErrorHandler`, `deregisterDisposable`, `deregisterHealthCheck`, `deriveJsonSchema`, `discoverSchedules`, `dispatcher`, `disposableCount`, `encodeBase64`, `eventStream`, `fake`, `formatErrorForConsole`, `generateAppKey`, `generateRoutesContent`, `generateRoutesFile`, `getActiveFake`, `getBootHooks`, `getListenerMetadata`, `getManifest`, `getScheduleMetadata`, `getShutdownHooks`, `healthCheckCount`, `isDebugEnabled`, `isDevelopment`, `isExplicitlyDevelopment`, `isProduction`, `jsx`, `nextRun`, `paginateCursor`, `paginateOffset`, `parseTimeWindow`, `readPaginationParams`, `registerCoreCommands`, `registerDisposable`, `registerHealthCheck`, `registerListeners`, `registerSchedules`, `renderError`, `resolve`, `resolveEnvName`, `resolveKeyMaterial`, `restore`, `route`, `runBootHooks`, `safeForLog`, `scanControllers`, `scheduler`, `setEventsDebug`, `setScheduler`, `sign`, `signedUrl`, `toPaginationProps`, `verify`, `waitForEvent` |
| interface | `AppConfig`, `AssetMapping`, `BootHookMeta`, `CacheConfig`, `CacheContract`, `CacheOptions`, `CompileConfig`, `ContainerContract`, `ContainerRegistration`, `ControllerInfo`, `ControllerMetadata`, `ControllerWithMetadata`, `CursorEnvelope`, `CursorLinks`, `CursorMeta`, `DatabaseConfig`, `DebugRecord`, `Disposable`, `DisposableHandle`, `EventQueue`, `FormatErrorOptions`, `GenerateRoutesResult`, `HealthCheck`, `HealthCheckHandle`, `HealthResult`, `JsonSchema`, `KernelConfig`, `ListenerConfig`, `ListenerMetadata`, `ListenerOptions`, `MiddlewareContract`, `Module`, `ModuleWithMiddleware`, `MountPoint`, `OffsetEnvelope`, `OffsetLinks`, `OffsetMeta`, `OnBootOptions`, `OnShutdownOptions`, `OverflowReport`, `PaginationComponentProps`, `PaginationParams`, `RenderErrorOptions`, `ResourceSchema`, `Route`, `RouteInfo`, `RouteMetadata`, `RouteOptions`, `ScheduleMetadata`, `ScheduleOptions`, `SchedulerLock`, `SchedulerReporter`, `SchedulerStats`, `SessionConfig`, `ShutdownConfig`, `ShutdownFailure`, `ShutdownHookMeta`, `ShutdownHooksContainer`, `ShutdownReport`, `SignedUrlOptions`, `SsgConfig`, `StaticOptions`, `StreamOptions`, `TaskFailure`, `TaskStats`, `ThrottleConfig`, `ThrottleOptions`, `ThrottleStoreContract`                                                                                                                                                                                                                                                                                                  |
| typeAlias | `Child`, `ComposableMiddleware`, `Constructor`, `Context`, `ControllerClass`, `Env`, `ErrorHandler`, `EventListener`, `FC`, `FileExtension`, `Handler`, `Input`, `KeyRejection`, `ListenerClass`, `MiddlewareClass`, `MiddlewareHandler`, `MiddlewareInput`, `MiddlewareRegistry`, `Next`, `NotFoundHandler`, `OverflowPolicy`, `OverlapPolicy`, `PaginationEnvelope`, `PaginationMeta`, `PropsWithChildren`, `QuerySource`, `ScheduleClass`, `Schema`, `ServiceToken`, `ShutdownHookMethod`, `ThrottleKey`, `TimeWindow`, `ToSchema`, `TypedResponse`, `ValidationTargets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| variable  | `CacheServiceToken`, `Crypt`, `DEFAULT_BUFFER_SIZE`, `DEFAULT_CURSOR_PARAM`, `DEFAULT_OVERFLOW`, `DEFAULT_PAGE_PARAM`, `DEFAULT_PER_PAGE`, `DEFAULT_SCHEDULES_DIR`, `DEFAULT_SHUTDOWN_DEADLINE_MS`, `Delete`, `EXPIRES_PARAM`, `Fragment`, `Get`, `Hash`, `KERNEL_BOOT_HOOKS`, `KERNEL_CONFIG`, `KERNEL_GLOBAL_MIDDLEWARE`, `KERNEL_SHUTDOWN_HOOKS`, `KEY_BYTES`, `KEY_PREFIX`, `MAX_BUFFER_SIZE`, `MAX_PER_PAGE`, `MIDDLEWARE_NAME_KEY`, `NEVER_SERIALISE`, `OVERFLOW_POLICIES`, `PRESETS`, `Patch`, `Post`, `Put`, `REJECTED_KEYS`, `SHUTDOWN_PRIORITY`, `SIGNATURE_PARAM`, `basicAuth`, `bearerAuth`, `bodyLimit`, `cache`, `compress`, `container`, `contextStorage`, `cors`, `csrf`, `css`, `daily`, `declaredMiddlewares`, `deleteCookie`, `denoServeStatic`, `etag`, `everyFifteenMinutes`, `everyFiveMinutes`, `everyMinute`, `everyTenMinutes`, `everyThirtyMinutes`, `getCookie`, `getRuntimeKey`, `getSignedCookie`, `hc`, `hourly`, `html`, `ipRestriction`, `jsxRenderer`, `jwk`, `jwt`, `jwtDecode`, `jwtSign`, `jwtVerify`, `logger`, `methodOverride`, `monthly`, `namedRoutes`, `poweredBy`, `prettyJSON`, `raw`, `requestId`, `secureHeaders`, `serveStatic`, `setCookie`, `setSignedCookie`, `ssgParams`, `streamSSE`, `streamText`, `testClient`, `timeout`, `timing`, `trimTrailingSlash`, `useRequestContext`, `validator`, `weekdays`, `weekends`, `weekly`, `yearly`                                                                                                                                                                         |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                                  | Path                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| Application assembly                     | `app.ts`                                               |
| Boot sequence and bootstrap steps        | `kernel/bootstrap/steps/*.ts`                          |
| Route discovery and registration         | `routing/*.ts`                                         |
| Mount points and locale-prefixed routing | `routing/mount_manager.ts`, `routing/mount_pattern.ts` |
| Error rendering                          | `exceptions/*.ts`                                      |
| Log sanitisation                         | `logging/sanitize.ts`                                  |
| Optional-package loading                 | `kernel/bootstrap/optional_packages.ts`                |
| Rate limiting (`@Throttle`)              | `http/throttle_middleware.ts`                          |

## Pitfalls

- Hard rule #1 applies most sharply here: import Hono through `@lockness/hono`,
  never `hono` directly.
- The `OPTIONAL_FEATURES` packages are loaded by name. Renaming one breaks core
  at runtime with no compile error — grep for the string, not the import.
- A new optional feature is a key in `KernelConfig` **and** a row in
  `OPTIONAL_FEATURES` **and** an entry in `core.soft` — and, if a kit sets it, a
  declared import in that kit's `deno.json.stub` (`scripts/kit_features_test.ts`
  checks the last). Never probe for a package by presence: a package being in
  the import map must not change what an app does.
- Bootstrap steps run in registry order. Adding a step means placing it in
  `kernel/bootstrap/registry.ts`, not just writing the file.
- Mount patterns are built with `constrainedParam()`, never written as literals
  — an unconstrained `:param` swallows sibling routes such as `/.well-known/*`.

## Tests

<!-- generated:tests -->

56 test files for 74 source files:

- `packages/core/cli/tests/kernel_file.test.ts`
- `packages/core/cli/tests/ssg_command.test.ts`
- `packages/core/ssg/tests/build.test.ts`
- `packages/core/ssg/tests/build_integration.test.ts`
- `packages/core/ssg/tests/enumerate.test.ts`
- `packages/core/ssg/tests/locales.test.ts`
- `packages/core/ssg/tests/paths.test.ts`
- `packages/core/tests/app_file.test.ts`
- `packages/core/tests/app_file_load_failures.test.ts`
- `packages/core/tests/app_fluent_api.test.ts`
- `packages/core/tests/app_refactoring_integration.test.ts`
- `packages/core/tests/auth.test.ts`
- `packages/core/tests/boot_hooks_inheritance.test.ts`
- `packages/core/tests/bootstrap_steps.test.ts`
- `packages/core/tests/compose.test.ts`
- `packages/core/tests/compose_middleware.test.ts`
- `packages/core/tests/configured_packages.test.ts`
- `packages/core/tests/container.test.ts`
- `packages/core/tests/database_step.test.ts`
- `packages/core/tests/declare_middleware.test.ts`
- `packages/core/tests/declare_middleware_integration.test.ts`
- `packages/core/tests/default_view.test.ts`
- `packages/core/tests/environment.test.ts`
- `packages/core/tests/environment_tripwire.test.ts`
- `packages/core/tests/events_debug_step.test.ts`
- `packages/core/tests/events_reachability.test.ts`
- `packages/core/tests/health_routes.test.ts`
- `packages/core/tests/hono_reexports.test.ts`
- `packages/core/tests/kernel.test.ts`
- `packages/core/tests/kernel_ssg_config.test.ts`
- `packages/core/tests/listeners_step.test.ts`
- `packages/core/tests/load_failure_redaction.test.ts`
- `packages/core/tests/middleware_resolver_declared.test.ts`
- `packages/core/tests/mount_pattern.test.ts`
- `packages/core/tests/mount_points.test.ts`
- `packages/core/tests/on_boot.test.ts`
- `packages/core/tests/optional_packages.test.ts`
- `packages/core/tests/reexport_contract.test.ts`
- `packages/core/tests/resource.test.ts`
- `packages/core/tests/route_registry.test.ts`
- `packages/core/tests/router.test.ts`
- `packages/core/tests/routes_generator.test.ts`
- `packages/core/tests/schedule_discovery.test.ts`
- `packages/core/tests/scheduler_locks.test.ts`
- `packages/core/tests/scheduler_step.test.ts`
- `packages/core/tests/session_boot.test.ts`
- `packages/core/tests/shutdown_decorators.test.ts`
- `packages/core/tests/shutdown_deno_behaviour.test.ts`
- `packages/core/tests/shutdown_reachability.test.ts`
- `packages/core/tests/shutdown_registry.test.ts`
- `packages/core/tests/shutdown_sequence.test.ts`
- `packages/core/tests/shutdown_signals.test.ts`
- `packages/core/tests/shutdown_step_order.test.ts`
- `packages/core/tests/shutdown_wiring.test.ts`
- `packages/core/tests/signed_url.test.ts`
- `packages/core/tests/throttle.test.ts`

2 mutation batteries — **`deno test` does not run these.** Each is an executable
that mutates a source file and re-runs the suites that should notice. Run them
with `deno task mutate` (all of them, one at a time) or
`deno task mutate <name>` (one); nightly CI runs the full sweep. See
[testing.md](../../docs/testing.md#mutation-batteries).

- `packages/core/tests/mutations/scheduler_lock_517.ts`
- `packages/core/tests/mutations/session_secure_504.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 56 test files directly —

```bash
deno test -A packages/core/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
