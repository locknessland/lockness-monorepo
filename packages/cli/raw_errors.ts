/**
 * @fileoverview The `LOCKNESS_CLI_RAW_ERRORS` switch: whether `Cli.dispatch`
 * prints a non-failure error raw instead of through `renderError` (#488).
 *
 * **Internal.** Not exported from `mod.ts`; the dispatcher is its only reader.
 *
 * **Off by default, and off whenever it is not recognisably on.** The raw
 * error is what `renderError` exists to keep out of a log: a DSN in a cause, a
 * token in a query string, own properties no redaction looks at. CLI output
 * lands in CI and build logs, which an open-source project often publishes, so
 * the switch must never turn on by accident.
 *
 * An **allowlist**, trimmed and lowercased — the same parser shape as
 * `LOCKNESS_EVENTS_DEBUG` and `SCHEDULER_ENABLED`, for the same reason: a
 * denylist fails open, and `"true "` or a CRLF from a `.env` file would read as
 * whatever the denylist's author did not think of. Unlike those two, an
 * unrecognised value does **not** throw: it is read while an error is being
 * reported, and a throw here would replace that error with this one. It reads
 * as off and the dispatcher prints a notice instead.
 *
 * @module @lockness/cli/raw_errors
 */

import { safeForLog } from '@lockness/contract'

/** The environment variable this module reads. */
const VARIABLE = 'LOCKNESS_CLI_RAW_ERRORS'
/** Values that turn the raw output on. */
const ON = ['1', 'true', 'on', 'yes']
/** Values that leave it off, stated so a typo is told apart from a choice. */
const OFF = ['0', 'false', 'off', 'no']

/** What the switch reads as. Only `on` prints the raw error. */
export type RawErrorsSwitch =
    | { readonly state: 'off' }
    | { readonly state: 'on' }
    | { readonly state: 'unrecognised'; readonly value: string }

/** Reads one environment variable; `Deno.env.get` in production. */
export type EnvReader = (name: string) => string | undefined

/**
 * Read the switch.
 *
 * **A denied environment reads as off.** `Deno.env.get` raises `NotCapable`
 * rather than returning `undefined` when the process runs without
 * `--allow-env`, and a binary compiled with a narrowed permission set is a
 * legitimate way to run the CLI. Off is the safe reading of "cannot tell", and
 * the dispatcher still prints the redacted error and the hint naming the
 * switch, so nothing is hidden. Any other failure is a bug in the reader and is
 * re-thrown.
 *
 * @param read - Reads one variable. Defaults to the process environment.
 * @returns `on` only for an allowlisted on-value; `off` for unset, empty, an
 *   allowlisted off-value or a denied read; `unrecognised` (also off) for
 *   anything else, carrying the raw value for the notice.
 * @throws Whatever `read` throws, unless it is `Deno.errors.NotCapable`.
 *
 * @example
 * ```ts
 * readRawErrorsSwitch(() => 'yes')    // { state: 'on' }
 * readRawErrorsSwitch(() => 'maybe')  // { state: 'unrecognised', value: 'maybe' }
 * ```
 */
export function readRawErrorsSwitch(
    read: EnvReader = (name) => Deno.env.get(name),
): RawErrorsSwitch {
    let value: string | undefined
    try {
        value = read(VARIABLE)
    } catch (error) {
        if (error instanceof Deno.errors.NotCapable) return { state: 'off' }
        throw error
    }
    const normalised = value?.trim().toLowerCase()
    if (normalised === undefined || normalised === '') return { state: 'off' }
    if (ON.includes(normalised)) return { state: 'on' }
    if (OFF.includes(normalised)) return { state: 'off' }
    return { state: 'unrecognised', value: value as string }
}

/**
 * The last line of a redacted dispatcher error: how to see the raw one, or why
 * the value given did not turn it on.
 *
 * @param raw - The switch, in a state that prints redacted output.
 * @returns One line. The unrecognised value is quoted through `safeForLog`, so
 *   a CR or an escape sequence in the variable shows as what it is.
 *
 * @example
 * ```ts
 * rawErrorsHint({ state: 'off' })
 * // '(Credentials redacted. LOCKNESS_CLI_RAW_ERRORS=1 prints the raw error; …)'
 * ```
 */
export function rawErrorsHint(
    raw: Exclude<RawErrorsSwitch, { state: 'on' }>,
): string {
    if (raw.state === 'off') {
        return `(Credentials redacted. ${VARIABLE}=1 prints the raw error; never set it where the log is public.)`
    }
    return `${VARIABLE}="${
        safeForLog(raw.value)
    }" is not recognised, so the error above is redacted. Use one of: ${
        [...ON, ...OFF].join(', ')
    }.`
}
