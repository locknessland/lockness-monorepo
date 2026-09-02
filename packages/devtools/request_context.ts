/**
 * @fileoverview Per-request context for correlating collected data to a request.
 *
 * The devtools middleware runs each request inside this `AsyncLocalStorage`
 * scope so passive collectors — notably the events subscriber, which has no
 * access to the Hono context — can tag what they capture with the current
 * `requestId`. Events fired outside a request (boot, background jobs) see an
 * empty store and are recorded unattributed.
 *
 * @module @lockness/devtools/request_context
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** The scope carried through a request. */
export interface DevtoolsRequestScope {
    /** Correlates every record captured during this request. */
    readonly requestId: string
}

/**
 * The process-wide devtools request scope. Established once, in the devtools
 * middleware, via {@link AsyncLocalStorage.run}.
 */
export const devtoolsRequestContext: AsyncLocalStorage<DevtoolsRequestScope> =
    new AsyncLocalStorage<DevtoolsRequestScope>()

/**
 * The current request's id, or `undefined` outside a request scope.
 *
 * @returns The active `requestId`, or `undefined`.
 */
export function currentRequestId(): string | undefined {
    return devtoolsRequestContext.getStore()?.requestId
}
