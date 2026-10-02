/**
 * @fileoverview Environment-name resolution — the single home of the rule that
 * turns the process environment into `'production'` / `'development'`.
 *
 * Lives in `@lockness/contract` (the zero-dependency foundation) so every layer
 * — including feature packages like `@lockness/devtools` — can consult it
 * without importing `@lockness/core` and inverting the dependency graph.
 * `@lockness/core` re-exports it, and scaffolded apps read their environment
 * through that re-export rather than through `Deno.env`.
 *
 * **`APP_ENV` is the only signal** (#504). It is read in exactly one place,
 * trimmed and lower-cased, and every predicate below derives from that one
 * read, so they cannot disagree with each other or with the app's config.
 * `DENO_ENV` is not read here; since v0.5.0 the framework only notices it at
 * boot and refuses to start when it disagrees with `APP_ENV` (see
 * `@lockness/contract/environment/internal`).
 *
 * Invariants:
 * - **One reader.** Callers use these functions, never a raw `Deno.env` read.
 * - **Absence is never production.** An unset or blank `APP_ENV` resolves to
 *   `'development'` for the conveniences, but is never production and never
 *   explicit development, so the security controls fail closed.
 * - **Production and explicit development are mutually exclusive.**
 * - **Resolution never throws on a missing permission.** Without `--allow-env`
 *   `Deno.env.get` raises `NotCapable`; that reads as unset.
 *
 * @module @lockness/contract/environment
 */

import { readEnvName } from './environment_read.ts'

/** The normalised `APP_ENV`, or `undefined` when unset, blank or unreadable. */
function explicitEnvName(): string | undefined {
    return readEnvName('APP_ENV')
}

/**
 * Resolve the environment name from `APP_ENV`.
 *
 * Trimmed and lower-cased; an unset, blank or unreadable `APP_ENV` resolves to
 * `'development'`. Safe to call without `--allow-env`.
 *
 * @returns The environment name, e.g. `'production'`, `'staging'` or
 * `'development'`.
 *
 * @example
 * ```typescript
 * const env = resolveEnvName()  // 'production' under APP_ENV=production
 * ```
 */
export function resolveEnvName(): string {
    return explicitEnvName() ?? 'development'
}

/**
 * Whether the application is running in production.
 *
 * True only when `APP_ENV` is explicitly `production` (any case, surrounding
 * whitespace ignored). An unset `APP_ENV` is never production.
 *
 * @returns `true` when `APP_ENV` names production.
 *
 * @example
 * ```typescript
 * if (isProduction()) throw new Error('refusing to start without a key')
 * ```
 */
export function isProduction(): boolean {
    return explicitEnvName() === 'production'
}

/**
 * Whether the application is running in development.
 *
 * A convenience that **fails open**: it is `true` when `APP_ENV` is unset (the
 * default name is `'development'`). A control that must **fail closed** on an
 * ambiguous environment — deciding whether to expose a debug surface, or
 * whether a cookie may travel without `Secure` — must use
 * {@link isExplicitlyDevelopment} instead.
 *
 * @returns `true` when the resolved environment name is `'development'`.
 *
 * @example
 * ```typescript
 * const verboseLogs = isDevelopment()
 * ```
 */
export function isDevelopment(): boolean {
    return resolveEnvName() === 'development'
}

/**
 * Whether `APP_ENV` is **explicitly** set to `'development'`.
 *
 * Unlike {@link isDevelopment}, this is `false` when `APP_ENV` is unset, blank
 * or unreadable — it requires a positive, explicit signal. Use it to **fail
 * closed** for surfaces that must never activate by default (e.g. mounting a
 * dev-only debug bar, or showing error details). It is never true at the same
 * time as {@link isProduction}.
 *
 * @returns `true` only when `APP_ENV` names development.
 *
 * @example
 * ```typescript
 * if (!isExplicitlyDevelopment()) return  // do not mount outside explicit dev
 * ```
 */
export function isExplicitlyDevelopment(): boolean {
    return explicitEnvName() === 'development'
}
