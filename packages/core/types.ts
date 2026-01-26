import type {
    Context,
    ControllerClass,
    IMiddleware,
    MiddlewareClass,
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
    IMiddleware,
    MiddlewareClass,
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
