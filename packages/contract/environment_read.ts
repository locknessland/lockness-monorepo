/**
 * @fileoverview The one raw read of the process environment (#504, #597,
 * #624): plan 274 §5 "Safe env read".
 *
 * `environment.ts`, `environment_guard.ts` and `environment_legacy.ts` read
 * their variables here, and so do `@lockness/cli`'s `LOCKNESS_CLI_RAW_ERRORS`
 * switch and `@lockness/devtools`' `LOCKNESS_DEVTOOLS` switch, through the
 * framework-internal entry point `@lockness/contract/environment/read/internal`
 * — so the permission handling and the normalisation rule exist once.
 *
 * **Unreadable is not unset** (#624). A Deno process without the env grant for
 * a variable — a `deno compile` binary, a hardened run with a narrowed
 * `--allow-env` — cannot see it, which is not the same as the variable being
 * absent. {@link readEnv} keeps the two apart, so a production guard can fail
 * closed on the first while treating the second as development. On Bun and
 * Node every variable is readable.
 *
 * Still Deno-bound: on Deno the read must ask the permission first, which
 * means knowing the runtime, and the one runtime detector arrives with
 * `@lockness/runtime` (plan 274 C12). Until then this module is the only
 * `Deno.env` reader its callers reach, so making it runtime-neutral is one
 * change here (C13) — the body of {@link readEnv} — not one per caller.
 *
 * @module @lockness/contract/environment/read/internal
 */

/**
 * The outcome of one environment read: either the runtime showed the variable
 * (`value` is `undefined` when it is unset), or it refused to.
 */
export type EnvRead =
    | { readonly readable: true; readonly value: string | undefined }
    | { readonly readable: false }

/** The one unreadable outcome; it carries nothing, so it is shared. */
const UNREADABLE: EnvRead = Object.freeze({ readable: false })

/**
 * Read one environment variable, keeping *unreadable* distinct from *unset* —
 * and asking first, so the read never shows a permission prompt.
 *
 * `Deno.env.get` without the permission does not simply fail: in an
 * interactive terminal Deno first prompts for it, and a caller may be in the
 * middle of an error report (`@lockness/cli`) or of boot. `querySync` only
 * reports the state and never prompts, so anything short of `granted` is
 * unreadable.
 *
 * A granted read can still raise `NotCapable` (a permission revoked in
 * between, or a stubbed reader). The variable is not visible, so that is
 * unreadable too — never unset, which would let a production guard read a
 * process it cannot see as development. Any other failure is not that
 * condition, so it propagates.
 *
 * @param name - The variable to read.
 * @returns `{ readable: true, value }` (`value` `undefined` when unset), or
 *   `{ readable: false }` when the runtime does not show the variable.
 * @throws Whatever `Deno.env.get` raises other than `NotCapable` —
 *   `InvalidData` when the value is not valid Unicode.
 *
 * @example
 * ```ts
 * const read = readEnv('APP_KEY')
 * if (!read.readable) console.warn('APP_KEY cannot be read')
 * ```
 */
export function readEnv(name: string): EnvRead {
    const { state } = Deno.permissions.querySync({
        name: 'env',
        variable: name,
    })
    if (state !== 'granted') return UNREADABLE
    try {
        return { readable: true, value: Deno.env.get(name) }
    } catch (error) {
        if (error instanceof Deno.errors.NotCapable) return UNREADABLE
        throw error
    }
}

/**
 * Read one environment variable, an unreadable one reading as unset — the
 * lossy projection of {@link readEnv}.
 *
 * For opt-in switches only, whose correct state when the process cannot see
 * them is **off** (`LOCKNESS_CLI_RAW_ERRORS`, `LOCKNESS_DEVTOOLS`). A value
 * whose unreadable state must fail closed — `APP_ENV` behind a production
 * guard — reads through {@link readEnv} or {@link readAppEnv} instead.
 *
 * @param name - The variable to read.
 * @returns Its raw value, or `undefined` when it is unset or unreadable.
 * @throws Whatever {@link readEnv} throws — `InvalidData` when the value is
 *   not valid Unicode.
 *
 * @example
 * ```ts
 * readEnvVar('LOCKNESS_CLI_RAW_ERRORS') // '1', or undefined
 * ```
 */
export function readEnvVar(name: string): string | undefined {
    const read = readEnv(name)
    return read.readable ? read.value : undefined
}

/**
 * Normalise an environment name.
 *
 * Trimmed and lower-cased, so `Production` and `production\r` (a CRLF `.env`)
 * mean `production`. An empty or blank value means unset: `APP_ENV=` must not
 * become an environment called `''`.
 */
function normaliseEnvName(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined
    const normalised = raw.trim().toLowerCase()
    return normalised === '' ? undefined : normalised
}

/**
 * Read an environment-name variable and normalise it, an unreadable one
 * reading as unset.
 *
 * @param name - The variable to read; the legacy tripwire reads `DENO_ENV`.
 * @returns The normalised name, or `undefined` when unset, blank or unreadable.
 * @throws Whatever {@link readEnv} throws.
 *
 * @example
 * ```ts
 * readEnvName('DENO_ENV') // 'production' under DENO_ENV=" Production"
 * ```
 */
export function readEnvName(name: string): string | undefined {
    return normaliseEnvName(readEnvVar(name))
}

/**
 * The one normalised `APP_ENV` read, unreadable kept distinct from unset.
 *
 * Every predicate in `@lockness/contract/environment` and the production-risk
 * rule in `@lockness/contract/environment/guard/internal` derive from this one
 * read, so they cannot disagree on what `APP_ENV` says.
 *
 * @returns `{ readable: true, value }` with `value` trimmed and lower-cased
 *   (`undefined` when unset or blank), or `{ readable: false }`.
 * @throws Whatever {@link readEnv} throws.
 *
 * @example
 * ```ts
 * readAppEnv() // { readable: true, value: 'production' } under APP_ENV=Production
 * ```
 */
export function readAppEnv(): EnvRead {
    const read = readEnv('APP_ENV')
    if (!read.readable) return read
    return { readable: true, value: normaliseEnvName(read.value) }
}
