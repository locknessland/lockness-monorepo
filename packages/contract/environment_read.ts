/**
 * @fileoverview The one raw read of the process environment (#504, #597):
 * plan 274 §5 "Safe env read".
 *
 * `environment.ts` and `environment_legacy.ts` read their variables here, and
 * so does `@lockness/cli`'s `LOCKNESS_CLI_RAW_ERRORS` switch, through the
 * framework-internal entry point `@lockness/contract/environment/read/internal`
 * — so the permission handling and the normalisation rule exist once.
 *
 * Still Deno-bound: on Deno the read must ask the permission first, which
 * means knowing the runtime, and the one runtime detector arrives with
 * `@lockness/runtime` (plan 274 C12). Until then this module is the only
 * `Deno.env` reader its callers reach, so making it runtime-neutral is one
 * change here (C13), not one per caller.
 *
 * @module @lockness/contract/environment/read/internal
 */

/**
 * Read one environment variable, treating a missing `--allow-env` as unset —
 * and asking first, so the read never shows a permission prompt.
 *
 * `Deno.env.get` without the permission does not simply fail: in an
 * interactive terminal Deno first prompts for it, and a caller may be in the
 * middle of an error report (`@lockness/cli`) or of boot. `querySync` only
 * reports the state and never prompts, so anything short of `granted` reads
 * as unset.
 *
 * A granted read can still raise `NotCapable` (a permission revoked in
 * between, or a stubbed reader). That is an expected, documented condition
 * with exactly one correct reading — the variable is not visible, so it is
 * unset — and the helpers built on this must never throw before shutdown
 * handlers exist. Any other failure is not that condition, so it propagates.
 *
 * @param name - The variable to read.
 * @returns Its raw value, or `undefined` when it is unset, not granted or not
 *   visible.
 * @throws Whatever `Deno.env.get` raises other than `NotCapable` —
 *   `InvalidData` when the value is not valid Unicode.
 *
 * @example
 * ```ts
 * readEnvVar('LOCKNESS_CLI_RAW_ERRORS') // '1', or undefined
 * ```
 */
export function readEnvVar(name: string): string | undefined {
    const { state } = Deno.permissions.querySync({
        name: 'env',
        variable: name,
    })
    if (state !== 'granted') return undefined
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
