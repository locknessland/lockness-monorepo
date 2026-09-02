/**
 * @fileoverview Environment-name resolution — the single home of the rule that
 * turns process environment variables into `'production'` / `'development'`.
 *
 * Lives in `@lockness/contract` (the zero-dependency foundation) so every layer
 * — including feature packages like `@lockness/devtools` — can consult it
 * without importing `@lockness/core` and inverting the dependency graph.
 * `@lockness/core` re-exports it, so its public API is unchanged.
 *
 * The framework ships artefacts that set **different** variable names: the
 * generated Docker image sets `DENO_ENV=production`, while the scaffolded `.env`
 * sets `APP_ENV`. A site that consults only one is inert under the other — so
 * resolution lives in one place and honours **both**, `DENO_ENV` first.
 *
 * Invariants:
 * - **One reader.** Callers use these functions, never a raw `Deno.env` read.
 * - **Absence is never production.** Neither variable set → `'development'`, so
 *   the error-detail gates fail closed.
 * - **Resolution never throws.** `Deno.env.get` raises `NotCapable` without
 *   `--allow-env`; the read is guarded so callers need no permission and no
 *   guard of their own.
 *
 * @module @lockness/contract/environment
 */

/**
 * Resolve the environment name from the process environment.
 *
 * Reads `DENO_ENV` first, then `APP_ENV`, defaulting to `'development'`. Safe to
 * call without `--allow-env`: a read failure resolves to `'development'` rather
 * than propagating.
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
        // No `--allow-env` (NotCapable). The safe default: absence never means
        // production, and this must not throw before shutdown handlers exist.
        // An expected, documented condition with one correct outcome.
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
 * Note this is `true` when neither variable is set (the default name is
 * `'development'`). A control that must **fail closed** on an ambiguous
 * environment — e.g. deciding whether to expose a debug surface — must use
 * {@link isExplicitlyDevelopment} instead.
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

/**
 * Whether an environment variable is **explicitly** set to `'development'`.
 *
 * Unlike {@link isDevelopment}, this is `false` when neither `DENO_ENV` nor
 * `APP_ENV` is set and `false` under a `NotCapable` read — it requires a
 * positive, explicit signal. Use it to **fail closed** for surfaces that must
 * never activate by default (e.g. mounting a dev-only debug bar): an unset,
 * ambiguous, or permission-denied environment resolves to `false`.
 *
 * @returns `true` only when `DENO_ENV` or `APP_ENV` is exactly `'development'`.
 *
 * @example
 * ```typescript
 * if (!isExplicitlyDevelopment()) return  // do not mount outside explicit dev
 * ```
 */
export function isExplicitlyDevelopment(): boolean {
    try {
        return Deno.env.get('DENO_ENV') === 'development' ||
            Deno.env.get('APP_ENV') === 'development'
    } catch {
        return false
    }
}
