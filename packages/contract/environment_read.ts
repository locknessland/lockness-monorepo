/**
 * @fileoverview The one raw read of the process environment behind the
 * environment-name helpers (#504).
 *
 * `environment.ts` and `environment_legacy.ts` both read variables; they read
 * them here, so the permission handling and the normalisation rule exist once.
 * Framework packages reach {@link readEnv} on
 * `@lockness/contract/environment/read/internal`; it stays out of `mod.ts`,
 * which `@lockness/core` re-exports to every application.
 *
 * @module
 */

/**
 * The outcome of reading one environment variable without prompting.
 *
 * `not-granted` and `not-unicode` are both *unreadable*, and neither may be
 * read as `unset`: a caller that falls back to a weaker default on an unset
 * variable must refuse on an unreadable one instead (#627).
 */
export type EnvRead =
    | { readonly state: 'set'; readonly value: string }
    | { readonly state: 'unset' }
    | { readonly state: 'not-granted' }
    | { readonly state: 'not-unicode' }

/**
 * Read one environment variable, keeping *unreadable* distinct from *unset*.
 *
 * The permission for this variable is queried first, so the read never raises
 * a permission prompt: anything short of `granted` is `not-granted` and the
 * environment is not touched. A `NotCapable` raised after a granted query is
 * `not-granted` too. A value that is not valid Unicode is `not-unicode`; the
 * error is not re-thrown because Deno's message quotes the value, and the
 * variable may hold a secret.
 *
 * @param name - The variable to read.
 * @returns Its value, or which of unset / not granted / not Unicode it is.
 * @throws Any failure of the read other than `NotCapable` and `InvalidData`.
 *
 * @example
 * ```typescript
 * const read = readEnv('LOCKNESS_DEVTOOLS_TOKEN')
 * if (read.state === 'not-granted') throw new Error('grant --allow-env')
 * ```
 */
export function readEnv(name: string): EnvRead {
    const { state } = Deno.permissions.querySync({
        name: 'env',
        variable: name,
    })
    if (state !== 'granted') return { state: 'not-granted' }
    let value: string | undefined
    try {
        value = Deno.env.get(name)
    } catch (failure) {
        if (failure instanceof Deno.errors.NotCapable) {
            return { state: 'not-granted' }
        }
        if (failure instanceof Deno.errors.InvalidData) {
            return { state: 'not-unicode' }
        }
        throw failure
    }
    return value === undefined ? { state: 'unset' } : { state: 'set', value }
}

/**
 * Read one environment variable, treating a missing `--allow-env` as unset.
 *
 * `Deno.env.get` raises `NotCapable` when the process has no env permission.
 * That is an expected, documented condition with exactly one correct reading —
 * the variable is not visible, so it is unset — and the helpers built on this
 * must never throw before shutdown handlers exist. Any other failure is not
 * that condition, so it propagates.
 *
 * @param name - The variable to read.
 * @returns Its raw value, or `undefined` when it is unset or unreadable.
 * @throws Whatever `Deno.env.get` raises other than `NotCapable`.
 */
export function readEnvVar(name: string): string | undefined {
    try {
        return Deno.env.get(name)
    } catch (error) {
        if (error instanceof Deno.errors.NotCapable) return undefined
        throw error
    }
}

/**
 * Read an environment-name variable and normalise it.
 *
 * Trimmed and lower-cased, so `Production` and `production\r` (a CRLF `.env`)
 * mean `production`. An empty or blank value means unset: `APP_ENV=` must not
 * become an environment called `''`.
 *
 * @param name - The variable to read, `APP_ENV` or `DENO_ENV`.
 * @returns The normalised name, or `undefined` when unset, blank or unreadable.
 */
export function readEnvName(name: string): string | undefined {
    const raw = readEnvVar(name)
    if (raw === undefined) return undefined
    const normalised = raw.trim().toLowerCase()
    return normalised === '' ? undefined : normalised
}
