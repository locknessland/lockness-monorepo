// Export core types (Context, ErrorHandler, etc.) from our own types module
// Context is a type alias of Hono's Context, so it's compatible
export * from './types.ts'
export * from './app.ts'
export * from './decorators.ts'
export * from './router.ts'
export * from './validation.ts'
export * from './helpers.ts'
export * from './error_formatter.ts'
export * from './default_error_handler.tsx'

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
    zValidator,
} from '@lockness/hono'
