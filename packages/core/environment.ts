/**
 * @fileoverview Environment-name resolution — the single home of the rule that
 * turns process environment variables into `'production'` / `'development'`.
 *
 * The framework ships artefacts that set **different** variable names: the
 * generated Docker image sets `DENO_ENV=production`
 * (`packages/init/stubs/init/Dockerfile.stub`), while the scaffolded `.env`
 * sets `APP_ENV` (`packages/init/mod.ts`). A site that consults only one is
 * inert under the other — which once left the session boot gate disabled in the
 * very image it exists to protect. So resolution lives in exactly one place and
 * honours **both**, `DENO_ENV` first, then `APP_ENV`.
 *
 * Three invariants hold here and nowhere else:
 * - **One reader.** Every runtime site in `@lockness/core` calls these
 *   functions rather than reading `Deno.env` for the environment name.
 * - **Absence is never production.** With neither variable set the answer is
 *   `'development'`, so the error-detail gates fail closed.
 * - **Resolution never throws.** `Deno.env.get` raises `NotCapable` without
 *   `--allow-env`, and this runs in `server.ts` *before* shutdown handlers are
 *   installed — where a `deno compile --allow-net` binary once died over a
 *   banner. The read is guarded; callers need no `--allow-env` and no guard of
 *   their own.
 *
 * @module @lockness/core/environment
 */

/**
 * Resolve the environment name from the process environment.
 *
 * Reads `DENO_ENV` first, then `APP_ENV`, defaulting to `'development'`. Safe to
 * call without `--allow-env`: a `NotCapable` (or any read failure) resolves to
 * `'development'` rather than propagating, because absence must never read as
 * production and this runs before shutdown wiring exists.
 *
 * @returns The environment name, e.g. `'production'` or `'development'`.
 *
 * @example
 * ```typescript
 * const env = resolveEnvName()  // 'production' under DENO_ENV=production
 * ```
 */
export function resolveEnvName(): string {
    try {
        return Deno.env.get('DENO_ENV') ?? Deno.env.get('APP_ENV') ??
            'development'
    } catch {
        // No `--allow-env` (NotCapable). The safe default is the honest answer:
        // absence never means production, and this must not throw before the
        // shutdown handlers in server.ts are installed. Not a swallowed error —
        // an expected, documented condition with a single correct outcome.
        return 'development'
    }
}

/**
 * Whether the application is running in production.
 *
 * @returns `true` when the resolved environment name is `'production'`.
 *
 * @example
 * ```typescript
 * if (isProduction()) throw new Error('refusing to start without a key')
 * ```
 */
export function isProduction(): boolean {
    return resolveEnvName() === 'production'
}

/**
 * Whether the application is running in development.
 *
 * @returns `true` when the resolved environment name is `'development'`.
 *
 * @example
 * ```typescript
 * const showDetails = isDevelopment()
 * ```
 */
export function isDevelopment(): boolean {
    return resolveEnvName() === 'development'
}
