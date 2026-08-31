/**
 * @fileoverview The emitter's debug switch, and the only thing allowed to write
 * a debug line.
 *
 * **This module makes no `Deno.*` call, and must never make one.**
 * `@lockness/events` requires zero runtime permissions today, and
 * `@lockness/core` imports it on the boot path — so reading an environment
 * variable here would add `--allow-env` to every application that loads the
 * framework, including one compiled with a narrowed permission set. The read
 * lives in core's bootstrap instead, which is where `@lockness/scheduler`'s
 * equivalent already lives: that package reads no env either, and
 * `steps/scheduler.ts` does it for them both.
 *
 * @module @lockness/events/debug
 */

import { safeForLog } from '@lockness/contract'

/**
 * Process-wide, and off unless something switches it on.
 *
 * Not per-instance. A per-instance flag would mean two places decide whether a
 * line is written — the module and the emitter — and every call site would then
 * have to ask both.
 */
let enabled = false

/**
 * Turn emitter debugging on or off.
 *
 * Called by `@lockness/core`'s bootstrap after it has parsed
 * `LOCKNESS_EVENTS_DEBUG`. An application may call it directly too.
 *
 * @param on - Whether to log.
 *
 * @example
 * ```ts
 * import { setEventsDebug } from '@lockness/core'
 * setEventsDebug(true)
 * ```
 */
export function setEventsDebug(on: boolean): void {
    enabled = on
}

/**
 * Is emitter debugging on?
 *
 * @returns `true` when {@link debugLog} will write.
 *
 * @example
 * ```ts
 * if (isDebugEnabled()) expensiveDiagnostic()
 * ```
 */
export function isDebugEnabled(): boolean {
    return enabled
}

/**
 * Everything a debug line may say.
 *
 * **Closed on purpose, and with no string field.** FR-012 forbids a payload
 * reaching a log, and a rule about behaviour is one interpolation away from
 * being broken forever. A `debugLog(message: string)` — or a rest parameter —
 * would satisfy every word of that rule while making the violation trivial. A
 * record with no free-text field makes a payload *unrepresentable*, which the
 * type checker enforces at every future call site without anyone remembering.
 */
export interface DebugRecord {
    /** What happened. */
    readonly phase: 'register' | 'unregister' | 'emit' | 'dispatch'
    /** The event's name. Encoded before it is written. */
    readonly event: string
    /** How many listeners the event has at this moment. */
    readonly listenerCount: number
    /** Which listener, within a dispatch. */
    readonly index?: number
}

/**
 * Write one debug line, if debugging is on.
 *
 * The sole authority over what a debug line contains. No other module in this
 * package calls `console` for diagnostics.
 *
 * @param record - The line's fields. There is no way to pass a payload.
 *
 * @example
 * ```ts
 * debugLog({ phase: 'emit', event: 'UserCreated', listenerCount: 3 })
 * ```
 */
export function debugLog(record: DebugRecord): void {
    if (!enabled) return

    // Encoded, not interpolated raw. An event name is usually a class name, but
    // `emitString()` takes an arbitrary one, and a newline or an escape byte in
    // a log line forges entries and drives the operator's terminal.
    const event = safeForLog(record.event)
    const where = record.index === undefined ? '' : `[${record.index}] `

    console.debug(
        `🔎 events ${record.phase} ${where}${event} (${record.listenerCount} listener(s))`,
    )
}
