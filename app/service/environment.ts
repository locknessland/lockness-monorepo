/**
 * @fileoverview Injectable environment port.
 *
 * A tiny `@Service()` that exposes the project's single "are we in production?"
 * signal (`isProduction` from `config/app.ts`) through the DI container. Its
 * whole reason to exist is testability (A1/Q17): a consumer such as
 * {@link app/service/post_service.ts | PostService} *receives* the environment
 * by injection instead of *reading* the frozen module const, so a test can hand
 * it a fake and drive both the production and development branches.
 *
 * This is the one place blog code learns the environment. `PostService` must
 * never import `isProduction` directly.
 *
 * @module @service/environment
 */

import { Service } from '@lockness/core'
import { isProduction } from '@/config/app.ts'

/**
 * Environment port exposing the production flag.
 *
 * @example Production branch, faked in a test
 * ```ts
 * const env = { isProduction: true } satisfies Environment
 * const service = new PostService()
 * service.environment = env
 * ```
 */
@Service()
export class Environment {
    /**
     * Whether the application runs in production.
     *
     * Sourced from `config/app.ts` (`APP_ENV === 'production'`) — the project's
     * single source of truth. Read here, never in the consuming service.
     *
     * @returns `true` when `APP_ENV` is `production`, otherwise `false`.
     */
    get isProduction(): boolean {
        return isProduction
    }
}
