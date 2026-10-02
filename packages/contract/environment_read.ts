/**
 * @fileoverview The one raw read of the process environment behind the
 * environment-name helpers (#504).
 *
 * `environment.ts` and `environment_legacy.ts` both read variables; they read
 * them here, so the permission handling and the normalisation rule exist once.
 * Not an export of the package: it is reached by relative import only.
 *
 * @module
 */

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
