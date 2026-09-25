/**
 * @fileoverview The `unhandledrejection` watcher, and the every-channel-throws
 * console, that the containment witnesses share (#376, #391, #395).
 *
 * On Deno an unhandled rejection terminates the process, so a witness that
 * let one through would kill the runner instead of failing by name. The
 * watcher records each escape and `preventDefault()`s it, and the witness
 * asserts on what it recorded.
 *
 * @module @lockness/realtime/tests/escape_watcher
 */

/**
 * The real `setTimeout`, captured at module load — before any witness installs
 * FakeTime — so {@link settle} always yields a real macrotask.
 */
const REAL_SET_TIMEOUT = globalThis.setTimeout

/**
 * Yield five real macrotasks: a rejection's `unhandledrejection` event is
 * dispatched after one, and a chain a few hops long needs the rest.
 *
 * @returns A promise that resolves after the fifth macrotask.
 */
export async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => REAL_SET_TIMEOUT(resolve, 0))
    }
}

/**
 * Run `body` while recording every rejection that reaches the runtime
 * unhandled. Each is `preventDefault()`ed so the row fails on its assertion
 * instead of the runner dying; the listener is removed whatever happens.
 *
 * @param body - The witness; it receives the live list of escaped reasons.
 * @returns A promise that settles as `body` does.
 */
export async function watchingEscapes(
    body: (escaped: unknown[]) => Promise<void>,
): Promise<void> {
    const escaped: unknown[] = []
    const listener = (event: PromiseRejectionEvent) => {
        event.preventDefault()
        escaped.push(event.reason)
    }
    globalThis.addEventListener('unhandledrejection', listener)
    try {
        await body(escaped)
    } finally {
        globalThis.removeEventListener('unhandledrejection', listener)
    }
}

/** Every log channel refusing, as {@link everyChannelThrows} installs it. */
export interface ThrowingChannels extends Disposable {
    /** How many times `console.error` was attempted. */
    errorCalls(): number
    /** Each attempted `console.error` line, its parts joined by a space. */
    errorLines(): readonly string[]
}

/**
 * Make `console.warn`, `console.error` and `Deno.stderr.writeSync` all throw,
 * recording each `console.error` attempt before it throws — so a witness can
 * tell the fallback it reached from one it did not. Restored on scope exit.
 *
 * @returns The recorder; dispose it (`using`) to restore the channels.
 */
export function everyChannelThrows(): ThrowingChannels {
    const realWarn = console.warn
    const realError = console.error
    const realWrite = Deno.stderr.writeSync
    const lines: string[] = []
    console.warn = () => {
        throw new Error('warn sink down')
    }
    console.error = (...parts: unknown[]) => {
        lines.push(parts.map(String).join(' '))
        throw new Error('error sink down')
    }
    Deno.stderr.writeSync = () => {
        throw new Error('stderr down')
    }
    return {
        errorCalls: () => lines.length,
        errorLines: () => lines,
        [Symbol.dispose]: () => {
            console.warn = realWarn
            console.error = realError
            Deno.stderr.writeSync = realWrite
        },
    }
}
