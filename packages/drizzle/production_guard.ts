/**
 * @fileoverview The production write-guard — a single chokepoint that refuses
 * destructive dev/test tooling (database seeding, factory `create()` inserts)
 * against a production database unless the caller explicitly opts in.
 *
 * Centralised on purpose (#258): every write-oriented dev command routes through
 * {@link assertNotProduction} rather than re-reading `APP_ENV` at each call site,
 * so a new destructive command inherits the guard by calling one function.
 *
 * Environment resolution is delegated to `@lockness/contract`'s
 * {@link isProduction} (reads `APP_ENV` only; absence is never production), so
 * the guard honours the same rules as the rest of the framework. A `DENO_ENV`
 * that disagrees with `APP_ENV` is refused outright (#504): these commands run
 * outside the app boot, so they carry the tripwire themselves.
 *
 * @module @lockness/drizzle/production_guard
 * @since 0.2.1
 */

import { isProduction } from '@lockness/contract'
import { legacyEnvironmentSignal } from '@lockness/contract/environment/internal'

/**
 * The CLI flag and programmatic-option name that override the guard. Kept as a
 * constant so the flag string and the message that documents it never drift.
 */
export const ALLOW_PRODUCTION_FLAG = '--allow-production' as const

/**
 * Refuse a destructive operation when running against a production environment.
 *
 * Throws unless `allowProduction` is `true` or the environment is not production
 * (per `@lockness/contract`'s {@link isProduction}). The thrown message names
 * the blocked operation and both override mechanisms — the CLI flag
 * `--allow-production` and the programmatic `{ allowProduction: true }` option —
 * so the caller learns how to proceed deliberately.
 *
 * @param operation - Human-readable name of the guarded operation, embedded in
 *   the error (e.g. `'db:seed'`, `'factory create()'`).
 * @param allowProduction - Explicit override. When `true`, the guard passes even
 *   in production. Defaults to `false`.
 * @throws {Error} When the environment is production and `allowProduction` is not
 *   set — the operation is refused.
 * @throws {Error} When `DENO_ENV` disagrees with `APP_ENV` (including `APP_ENV`
 *   unset), whatever `allowProduction` says — the message names `APP_ENV` and
 *   the fix.
 *
 * @example
 * ```ts
 * // CLI: refuse `db:seed` in production unless `--allow-production` was passed.
 * assertNotProduction('db:seed', args.includes('--allow-production'))
 *
 * // Programmatic: a factory create() honours an explicit option.
 * assertNotProduction('factory create()', options.allowProduction)
 * ```
 */
export function assertNotProduction(
    operation: string,
    allowProduction: boolean = false,
): void {
    // The DENO_ENV tripwire comes first, and the override does not reach it:
    // `allowProduction` authorises production, not an environment the
    // operator may still believe is production under the pre-v0.5.0 name.
    const legacy = legacyEnvironmentSignal()
    if (legacy?.kind === 'conflict') {
        throw new Error(`Refusing to run "${operation}": ${legacy.message}`)
    }

    if (allowProduction || !isProduction()) return

    throw new Error(
        `Refusing to run "${operation}" against a production environment ` +
            `(APP_ENV is "production"). This is a destructive dev/test ` +
            `operation. If this is intentional, override it explicitly: pass the ` +
            `${ALLOW_PRODUCTION_FLAG} CLI flag, or the { allowProduction: true } ` +
            `option for the programmatic API.`,
    )
}
