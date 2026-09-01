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

- **Optional packages are reached only through
  `tryImportOptionalPackage('<literal>', …)`.** The specifier is a _string
  argument_, so it appears in no module graph and **no static tool can see the
  edge** — `deno info` included. Those seven edges exist only because
  `deps.policy.jsonc` declares them under `soft`. Adding an eighth without
  declaring it makes it invisible to every check in the repository.
- **A soft dependency is never declared in `deno.json`.** The consuming
  application installs it, or the feature stays off. Declaring one would make an
  optional package mandatory for every consumer.
- **Bootstrap steps are ordered, and the order is load-bearing.** Controllers
  are built at step 550; anything that needs them must run after it.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                   |
| :--------------------------------------------- | :------------------------------------------------------------------------- |
| Imports (static)                               | `container`, `contract`, `events`, `hono`, `scheduler`                     |
| Imports (soft, via `tryImportOptionalPackage`) | `cache`, `container`, `devtools`, `drizzle`, `events`, `logger`, `session` |
| Imported by                                    | —                                                                          |
| **Must never import**                          | nothing — no package depends on this one                                   |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `App`, `BaseEvent`, `CircularDependencyError`, `Container`, `ControllerExecuting`, `EventBuffer`, `EventDispatcher`, `EventEmitter`, `ExceptionOccurred`, `HTTPException`, `Hono`, `HonoRequest`, `KernelBooted`, `KernelTerminating`, `RequestCompleted`, `RequestStarted`, `ResponsePrepared`, `Scheduler`, `ServiceNotFoundError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| function  | `Cache`, `CacheKey`, `CacheTTL`, `ComposeMiddleware`, `Controller`, `DeclareGlobalMiddleware`, `DeclareMiddleware`, `Inject`, `Kernel`, `Listener`, `Middleware`, `OnBoot`, `OnShutdown`, `Schedule`, `Service`, `Throttle`, `ThrottleApi`, `ThrottleHeavy`, `ThrottleLogin`, `ThrottleSensitive`, `Use`, `UseMiddleware`, `asset`, `bind`, `codeConstraint`, `compose`, `composeMiddleware`, `configureEventDispatcher`, `constrainedParam`, `createApp`, `createContainer`, `createEventQueue`, `debugLog`, `defaultErrorHandler`, `deregisterDisposable`, `discoverSchedules`, `dispatcher`, `disposableCount`, `eventStream`, `fake`, `formatErrorForConsole`, `generateRoutesContent`, `generateRoutesFile`, `getActiveFake`, `getBootHooks`, `getListenerMetadata`, `getManifest`, `getScheduleMetadata`, `getShutdownHooks`, `isDebugEnabled`, `isDevelopment`, `isProduction`, `jsx`, `nextRun`, `parseTimeWindow`, `registerCoreCommands`, `registerDisposable`, `registerListeners`, `registerSchedules`, `renderError`, `resolve`, `resolveEnvName`, `restore`, `route`, `runBootHooks`, `safeForLog`, `scanControllers`, `scheduler`, `setEventsDebug`, `setScheduler`, `waitForEvent` |
| interface | `AppConfig`, `AssetMapping`, `BootHookMeta`, `CacheConfig`, `CacheContract`, `CacheOptions`, `CompileConfig`, `ContainerContract`, `ControllerInfo`, `ControllerMetadata`, `ControllerWithMetadata`, `DatabaseConfig`, `DebugRecord`, `Disposable`, `DisposableHandle`, `EventQueue`, `FormatErrorOptions`, `GenerateRoutesResult`, `KernelConfig`, `ListenerConfig`, `ListenerMetadata`, `ListenerOptions`, `MiddlewareContract`, `Module`, `ModuleWithMiddleware`, `MountPoint`, `OnBootOptions`, `OnShutdownOptions`, `OverflowReport`, `Route`, `RouteInfo`, `RouteMetadata`, `RouteOptions`, `ScheduleMetadata`, `ScheduleOptions`, `SchedulerLock`, `SchedulerReporter`, `SchedulerStats`, `SessionConfig`, `ShutdownConfig`, `ShutdownFailure`, `ShutdownHookMeta`, `ShutdownHooksContainer`, `ShutdownReport`, `StreamOptions`, `TaskFailure`, `TaskStats`, `ThrottleConfig`, `ThrottleOptions`, `ThrottleStoreContract`                                                                                                                                                                                                                                                                   |
| typeAlias | `Child`, `ComposableMiddleware`, `Constructor`, `Context`, `ControllerClass`, `Env`, `ErrorHandler`, `EventListener`, `FC`, `FileExtension`, `Handler`, `Input`, `ListenerClass`, `MiddlewareClass`, `MiddlewareHandler`, `MiddlewareInput`, `MiddlewareRegistry`, `Next`, `NotFoundHandler`, `OverflowPolicy`, `OverlapPolicy`, `PropsWithChildren`, `ScheduleClass`, `Schema`, `ServiceToken`, `ShutdownHookMethod`, `ThrottleKey`, `TimeWindow`, `ToSchema`, `TypedResponse`, `ValidationTargets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| variable  | `CacheServiceToken`, `DEFAULT_BUFFER_SIZE`, `DEFAULT_OVERFLOW`, `DEFAULT_SCHEDULES_DIR`, `DEFAULT_SHUTDOWN_DEADLINE_MS`, `Delete`, `Fragment`, `Get`, `KERNEL_BOOT_HOOKS`, `KERNEL_CONFIG`, `KERNEL_GLOBAL_MIDDLEWARE`, `KERNEL_SHUTDOWN_HOOKS`, `MAX_BUFFER_SIZE`, `MIDDLEWARE_NAME_KEY`, `OVERFLOW_POLICIES`, `PRESETS`, `Patch`, `Post`, `Put`, `SHUTDOWN_PRIORITY`, `basicAuth`, `bearerAuth`, `bodyLimit`, `cache`, `compress`, `container`, `contextStorage`, `cors`, `csrf`, `css`, `daily`, `declaredMiddlewares`, `deleteCookie`, `denoServeStatic`, `etag`, `everyFifteenMinutes`, `everyFiveMinutes`, `everyMinute`, `everyTenMinutes`, `everyThirtyMinutes`, `getCookie`, `getRuntimeKey`, `getSignedCookie`, `hc`, `hourly`, `html`, `ipRestriction`, `jsxRenderer`, `jwk`, `jwt`, `jwtDecode`, `jwtSign`, `jwtVerify`, `logger`, `methodOverride`, `monthly`, `namedRoutes`, `poweredBy`, `prettyJSON`, `raw`, `requestId`, `secureHeaders`, `serveStatic`, `setCookie`, `setSignedCookie`, `ssgParams`, `streamSSE`, `streamText`, `testClient`, `timeout`, `timing`, `trimTrailingSlash`, `useRequestContext`, `validator`, `weekdays`, `weekends`, `weekly`, `yearly`             |

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

## Tests

<!-- generated:tests -->

34 test files for 57 source files:

- `packages/core/tests/app_fluent_api.test.ts`
- `packages/core/tests/app_refactoring_integration.test.ts`
- `packages/core/tests/auth.test.ts`
- `packages/core/tests/boot_hooks_inheritance.test.ts`
- `packages/core/tests/bootstrap_steps.test.ts`
- `packages/core/tests/compose.test.ts`
- `packages/core/tests/compose_middleware.test.ts`
- `packages/core/tests/container.test.ts`
- `packages/core/tests/declare_middleware.test.ts`
- `packages/core/tests/declare_middleware_integration.test.ts`
- `packages/core/tests/environment.test.ts`
- `packages/core/tests/events_debug_step.test.ts`
- `packages/core/tests/events_reachability.test.ts`
- `packages/core/tests/hono_reexports.test.ts`
- `packages/core/tests/kernel.test.ts`
- `packages/core/tests/middleware_resolver_declared.test.ts`
- `packages/core/tests/mount_pattern.test.ts`
- `packages/core/tests/mount_points.test.ts`
- `packages/core/tests/on_boot.test.ts`
- `packages/core/tests/route_registry.test.ts`
- `packages/core/tests/router.test.ts`
- `packages/core/tests/routes_generator.test.ts`
- `packages/core/tests/schedule_discovery.test.ts`
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
- `packages/core/tests/throttle.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 34 test files directly —

```bash
deno test -A packages/core/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
