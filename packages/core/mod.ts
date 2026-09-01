/**
 * @fileoverview Lockness Core Module
 *
 * Main entry point for the `@lockness/core` package.
 * Re-exports all public APIs including:
 *
 * - **App**: Main application class for bootstrapping
 * - **Decorators**: `@Controller`, `@Get`, `@Post`, `@OnBoot`, `@Listener`, etc.
 * - **Types**: `Context`, `Next`, `MiddlewareHandler`, etc.
 * - **Helpers**: `asset()`, `route()`, `formatErrorForConsole()`
 * - **Boot Lifecycle**: `runBootHooks()`, `getBootHooks()`
 * - **Events**: Event system with `@Listener`, `BaseEvent`, `dispatcher()`
 * - **Hono Re-exports**: All Hono middleware and utilities
 *
 * @module @lockness/core
 *
 * @example
 * ```typescript
 * import { App, Controller, Get, Context } from '@lockness/core'
 *
 * @Controller('/users')
 * class UserController {
 *     @Get('/')
 *     list(c: Context) {
 *         return c.json({ users: [] })
 *     }
 * }
 *
 * const app = new App()
 * await app.init({ controllers: [UserController] })
 * app.listen(8888)
 * ```
 */

// Export core types (Context, ErrorHandler, etc.) from contract package
export * from '@lockness/contract'
export * from './types.ts'
export * from './app.ts'
export * from './routing/router.ts'
export * from './routing/generator.ts'
export * from './routing/mount_pattern.ts'
export * from './logging/sanitize.ts'
export * from './exceptions/formatter.ts'
export * from './exceptions/default_view.tsx'
export * from './helpers.ts'

// Environment-name resolution (DENO_ENV first, then APP_ENV) — the single home
// of the production/development rule.
export * from './environment.ts'

// Export events system (decorators, dispatcher, base classes, testing)
export {
    BaseEvent,
    configureEventDispatcher,
    ControllerExecuting,
    // Streams, signals and the debug switch — #135. Core re-exports a NAMED
    // list, so anything absent from it is unreachable from an application even
    // though @lockness/events exports it.
    createEventQueue,
    debugLog,
    DEFAULT_BUFFER_SIZE,
    DEFAULT_OVERFLOW,
    dispatcher,
    EventBuffer,
    EventDispatcher,
    EventEmitter,
    eventStream,
    ExceptionOccurred,
    // Testing utilities
    fake,
    getActiveFake,
    getListenerMetadata,
    isDebugEnabled,
    // Framework lifecycle events
    KernelBooted,
    KernelTerminating,
    Listener,
    type ListenerMetadata,
    type ListenerOptions,
    MAX_BUFFER_SIZE,
    OVERFLOW_POLICIES,
    RequestCompleted,
    RequestStarted,
    ResponsePrepared,
    restore,
    setEventsDebug,
    waitForEvent,
} from '@lockness/events'
export type {
    DebugRecord,
    EventListener,
    EventQueue,
    ListenerConfig,
    OverflowPolicy,
    OverflowReport,
    StreamOptions,
} from '@lockness/events'

// Export listener registration for package authors
export {
    type ListenerClass,
    registerListeners,
} from './events/listener_discovery.ts'

// Export kernel features (boot lifecycle + declarative configuration)
export {
    type BootHookMeta,
    type CacheConfig,
    type DatabaseConfig,
    DeclareGlobalMiddleware,
    getBootHooks,
    Kernel,
    KERNEL_BOOT_HOOKS,
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
    OnBoot,
    type OnBootOptions,
    runBootHooks,
    type SessionConfig,
} from './kernel/mod.ts'

// Shutdown lifecycle — @OnShutdown and what an application needs to use it.
//
// Deliberately NARROWER than the modules export. `ShutdownSequence`,
// `ShutdownRegistry`, `installShutdownSignals`, `exitCodeFor`,
// `resolveDeadlineMs` and `renderError` are internal: a consumer calling
// `installShutdownSignals(new ShutdownSequence())` would install a SECOND pair
// of signal handlers over a SECOND teardown list, which is the two-deciders
// shape the decision table exists to prevent. Neither has a caller outside
// core. Re-export one only when something outside core needs it.
export {
    DEFAULT_SHUTDOWN_DEADLINE_MS,
    getShutdownHooks,
    KERNEL_SHUTDOWN_HOOKS,
    OnShutdown,
    type OnShutdownOptions,
    SHUTDOWN_PRIORITY,
    type ShutdownConfig,
    type ShutdownFailure,
    type ShutdownHookMeta,
    type ShutdownHookMethod,
    type ShutdownHooksContainer,
    type ShutdownReport,
} from './kernel/mod.ts'

// Export kernel loader
export { createApp } from './kernel/loader.ts'

// Re-export essential framework packages (used by core functionality)
export * from '@lockness/container'

/**
 * Re-export all Hono functionalities for unified framework API.
 *
 * Note: We use wildcard export from '@lockness/hono' which includes all Hono exports.
 * The Context exported from './types.ts' takes precedence as it's a compatible type alias.
 */
export {
    // All @lockness/hono re-exports (middleware, utilities, client, etc.)
    basicAuth,
    bearerAuth,
    bodyLimit,
    cache,
    type Child,
    compress,
    contextStorage,
    cors,
    csrf,
    css,
    decode as jwtDecode,
    deleteCookie,
    denoServeStatic,
    type Env,
    etag,
    type FC,
    // Core Hono types (HonoRequest as type-only to avoid isolatedModules error)
    Fragment,
    getCookie,
    getRuntimeKey,
    getSignedCookie,
    type Handler,
    hc,
    Hono,
    type HonoRequest,
    html,
    HTTPException,
    type Input,
    ipRestriction,
    jsx,
    jsxRenderer,
    jwk,
    jwt,
    logger,
    methodOverride,
    type MiddlewareHandler,
    type Next,
    type NotFoundHandler,
    poweredBy,
    prettyJSON,
    type PropsWithChildren,
    raw,
    requestId,
    type Schema,
    secureHeaders,
    serveStatic,
    setCookie,
    setSignedCookie,
    sign as jwtSign,
    ssgParams,
    streamSSE,
    streamText,
    testClient,
    timeout,
    timing,
    type ToSchema,
    trimTrailingSlash,
    type TypedResponse,
    useRequestContext,
    validator,
    verify as jwtVerify,
} from '@lockness/hono'

/**
 * Register core framework CLI commands.
 * This is used by the CLI to discover commands provided by the core package.
 *
 * @param cli - The CLI instance
 */
export async function registerCoreCommands(cli: any) {
    const { CompileCommand } = await import('./cli/compile_command.ts')
    cli.registerCommand(CompileCommand)
}

// ============================================================================
// Scheduler (@lockness/scheduler)
// ============================================================================

export {
    daily,
    DEFAULT_SCHEDULES_DIR,
    everyFifteenMinutes,
    everyFiveMinutes,
    everyMinute,
    everyTenMinutes,
    everyThirtyMinutes,
    getScheduleMetadata,
    hourly,
    monthly,
    nextRun,
    PRESETS,
    Schedule,
    Scheduler,
    scheduler,
    setScheduler,
    weekdays,
    weekends,
    weekly,
    yearly,
} from '@lockness/scheduler'
export type {
    OverlapPolicy,
    ScheduleMetadata,
    ScheduleOptions,
    SchedulerLock,
    SchedulerReporter,
    SchedulerStats,
    TaskFailure,
    TaskStats,
} from '@lockness/scheduler'
export {
    discoverSchedules,
    registerSchedules,
} from './scheduler/schedule_discovery.ts'
export type { ScheduleClass } from './scheduler/schedule_discovery.ts'
