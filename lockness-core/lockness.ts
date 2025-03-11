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

import { Hono } from 'jsr:@hono/hono'

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
export { Hono }

/**
 * Lockness framework
 */
import {
    All,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Req,
    Res,
} from './decorators/controller.ts'
export { All, Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res }

import { app } from './decorators/controller.ts'
export { app }
