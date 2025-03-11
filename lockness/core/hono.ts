/**
 * @module
 *
 * Hono - Web Framework built on Web Standards
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * const app = new Hono()
 *
 * app.get('/', (c) => c.text('Hono!'))
 *
 * export default app
 * ```
 */

import { Context, Hono } from 'jsr:@hono/hono'
import { SmartRouter } from 'jsr:@hono/hono/router/smart-router'
import { RegExpRouter } from 'jsr:@hono/hono/router/reg-exp-router'
import { TrieRouter } from 'jsr:@hono/hono/router/trie-router'

/**
 * Types for environment variables, error handlers, handlers, middleware handlers, and more.
 */
export type {
    Env,
    ErrorHandler,
    Handler,
    Input,
    MiddlewareHandler,
    Next,
    NotFoundHandler,
    Schema,
    ToSchema,
    TypedResponse,
    ValidationTargets,
} from 'jsr:@hono/hono/types'
/**
 * Types for context, context variable map, context renderer, and execution context.
 */
export type {
    Context,
    ContextRenderer,
    ContextVariableMap,
    ExecutionContext,
} from 'jsr:@hono/hono'
/**
 * Type for HonoRequest.
 */
export type { HonoRequest } from 'jsr:@hono/hono/request'
/**
 * Types for inferring request and response types and client request options.
 */
export type {
    ClientRequestOptions,
    InferRequestType,
    InferResponseType,
} from 'jsr:@hono/hono'

/**
 * Hono framework for building web applications.
 */
export { Hono, RegExpRouter, SmartRouter, TrieRouter }
