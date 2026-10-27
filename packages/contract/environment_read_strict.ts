/**
 * @fileoverview The prompt-free environment read that keeps an unreadable
 * variable distinct from an unset one (#627).
 *
 * Framework packages reach it on
 * `@lockness/contract/environment/read/internal`. It lives apart from
 * `environment_read.ts`, whose `readEnvVar` reads an unreadable variable as
 * unset, so that entry point exports only the strict read. It stays out of
 * `mod.ts`, which `@lockness/core` re-exports to every application.
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
 * if (read.state !== 'set' && read.state !== 'unset') {
 *     throw new Error(`LOCKNESS_DEVTOOLS_TOKEN is unreadable (${read.state})`)
 * }
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
