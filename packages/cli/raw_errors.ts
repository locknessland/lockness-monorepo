/**
 * @fileoverview The `LOCKNESS_CLI_RAW_ERRORS` switch: whether `Cli.dispatch`
 * prints a non-failure error raw instead of through `renderError` (#488).
 *
 * **Internal.** Not exported from `mod.ts`; the printer in `report.ts`, behind
 * `Cli.dispatch` and `runEntry`, is its only reader.
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
 * **The read is total and never prompts** (#508). Nothing it can meet — a
 * process without env permission, a value that is not valid Unicode, a reader
 * that throws — gets past it: each reads as off, and the dispatcher still
 * prints the command's own error.
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

/**
 * What the notice shows in place of a value that could not be read. Never the
 * value itself: there is none to show, and the runtime's error message for it
 * quotes the raw bytes.
 */
export type UnreadablePlaceholder = '<not valid Unicode>' | '<unreadable>'

/** What the switch reads as. Only `on` prints the raw error. */
export type RawErrorsSwitch =
    | { readonly state: 'off' }
    | { readonly state: 'on' }
    | { readonly state: 'unrecognised'; readonly value: string }
    | {
        readonly state: 'unreadable'
        readonly placeholder: UnreadablePlaceholder
    }

/** Reads one environment variable; {@link readEnvWithoutPrompt} in production. */
export type EnvReader = (name: string) => string | undefined

/**
 * Read one environment variable, or `undefined` when the process was not
 * granted it — asked first, so the read never shows a permission prompt.
 *
 * `Deno.env.get` without the permission does not simply fail: in an
 * interactive terminal Deno first prompts for it, and this read happens in the
 * middle of an error report. `querySync` only reports the state and never
 * prompts, so anything short of `granted` reads as unset.
 *
 * @param name - The variable to read.
 * @returns Its value, or `undefined` when it is unset or not granted.
 * @throws `Deno.errors.InvalidData` when the value is not valid Unicode.
 *
 * @example
 * ```ts
 * readEnvWithoutPrompt('LOCKNESS_CLI_RAW_ERRORS') // '1', or undefined
 * ```
 */
export function readEnvWithoutPrompt(name: string): string | undefined {
    const { state } = Deno.permissions.querySync({
        name: 'env',
        variable: name,
    })
    if (state !== 'granted') return undefined
    return Deno.env.get(name)
}

/**
 * Read the switch. **Total: it never throws.**
 *
 * **A denied environment reads as off.** The default reader asks for the
 * permission without prompting and reads a variable it was not granted as
 * unset; a custom reader may instead raise `NotCapable`, which reads as off
 * too. A binary compiled with a narrowed permission set is a legitimate way to
 * run the CLI. Off is the safe reading of "cannot tell", and the dispatcher
 * still prints the redacted error and the hint naming the switch, so nothing
 * is hidden.
 *
 * **Any other failure reads as off with a notice** (#508). It is read while an
 * error is being reported, so a throw here would replace that error with this
 * one — which is what a value holding bytes that are not valid Unicode used to
 * do (`InvalidData`). The notice names the value by a placeholder, never by
 * the runtime's message, which quotes the bytes.
 *
 * @param read - Reads one variable. Defaults to {@link readEnvWithoutPrompt}.
 * @returns `on` only for an allowlisted on-value; `off` for unset, empty, an
 *   allowlisted off-value or a denied read; `unrecognised` (also off) for
 *   anything else, carrying the raw value for the notice; `unreadable` (also
 *   off) when the read failed any other way.
 *
 * @example
 * ```ts
 * readRawErrorsSwitch(() => 'yes')    // { state: 'on' }
 * readRawErrorsSwitch(() => 'maybe')  // { state: 'unrecognised', value: 'maybe' }
 * ```
 */
export function readRawErrorsSwitch(
    read: EnvReader = readEnvWithoutPrompt,
): RawErrorsSwitch {
    let value: string | undefined
    try {
        value = read(VARIABLE)
    } catch (error) {
        if (error instanceof Deno.errors.NotCapable) return { state: 'off' }
        return {
            state: 'unreadable',
            placeholder: error instanceof Deno.errors.InvalidData
                ? '<not valid Unicode>'
                : '<unreadable>',
        }
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
 * @returns One line. An unrecognised value is quoted through `safeForLog`, so
 *   a CR or an escape sequence in the variable shows as what it is; an
 *   unreadable one shows its placeholder.
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
    const choices = [...ON, ...OFF].join(', ')
    if (raw.state === 'unreadable') {
        return `${VARIABLE}=${raw.placeholder} could not be read, so the error above is redacted. Use one of: ${choices}.`
    }
    return `${VARIABLE}="${
        safeForLog(raw.value)
    }" is not recognised, so the error above is redacted. Use one of: ${choices}.`
}
