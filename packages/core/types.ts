import type {
    Context,
    ControllerClass,
    MiddlewareClass,
    MiddlewareContract,
    MiddlewareHandler,
    MiddlewareInput,
    MiddlewareRegistry,
    Next,
    Route,
    ValidationTargets,
} from '@lockness/contract'

export type {
    Context,
    ControllerClass,
    MiddlewareClass,
    MiddlewareContract,
    MiddlewareHandler,
    MiddlewareInput,
    MiddlewareRegistry,
    Next,
    Route,
    ValidationTargets,
}

export interface Module {
    controllers: ControllerClass[]
}

/**
 * Configuration for a single mount point.
 */
export interface MountPoint {
    readonly pattern: string
    readonly middleware?: (c: Context, next: Next) => Promise<void | Response>
}

export interface AppConfig {
    controllersDir?: string
    middlewaresDir?: string
    staticDir?: string
    readonly mountPoint?: MountPoint
    readonly compile?: CompileConfig
}

/**
 * Mapping of a source file or directory to a target directory in _dist.
 */
export interface AssetMapping {
    readonly source: string
    readonly target: string
    readonly include?: string | RegExp
}

/**
 * Configuration for binary compilation orchestration.
 */
export interface CompileConfig {
    readonly output?: string
    readonly assets?: readonly (string | AssetMapping)[]
    readonly scripts?: readonly string[]
    readonly flags?: readonly string[]
    readonly main?: string
}

/**
 * Configuration for static-site generation (#54, the `ssg:build` command).
 *
 * The single home for "which locales are emitted". Without it, the build emits
 * each `@Static` route once at its root path; with it, the route is additionally
 * emitted once per curated locale under the app's i18n mount prefix. The list is
 * curated on purpose — it is NOT the `validLanguages × validCountries` product —
 * to keep the output from exploding.
 */
export interface SsgConfig {
    /**
     * The curated locales to emit, as `lang-country` tuples (e.g. `'en-us'`,
     * `'fr-ca'`). Each is expanded against the app's mount pattern; entries whose
     * segments the mount pattern does not admit fail the build.
     */
    readonly locales?: readonly string[]
}

/**
 * Error handler function type
 */
export type ErrorHandler = (
    error: Error,
    c: Context,
) => Response | Promise<Response>

/**
 * Extended Module config with middleware support
 */
export interface ModuleWithMiddleware extends Module {
    globalMiddlewares?: MiddlewareInput[]
    middlewares?: MiddlewareRegistry
    errorHandler?: ErrorHandler
    staticDir?: string
}
