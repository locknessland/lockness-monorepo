/**
 * @fileoverview The bounded queue behind every event stream.
 *
 * **This module is the single home of how a stream buffers and what it drops.**
 * `eventStream()` and `anyEvent()` are both callers; neither keeps an array of
 * its own. Before this existed the queue was inline in `eventStream()` and
 * unbounded — a consumer that stopped pulling grew it for the life of the
 * process, with nothing said about it.
 *
 * @module @lockness/events/stream
 */

import { safeForLog } from '@lockness/contract'

/**
 * How many frames a stream holds before it starts dropping.
 *
 * **Chosen with the request `Context` in mind.** The framework's own lifecycle
 * events carry one — headers, cookies, the response — so a buffered frame is a
 * retained reference to all of it, not a copy of a value. The arithmetic a
 * caller owns is `streams × bufferSize × sizeof(Context)`, and the number of
 * streams is theirs to bound: this module bounds the depth of one, not how many
 * exist.
 */
export const DEFAULT_BUFFER_SIZE = 1_024

/**
 * The largest buffer a caller may ask for.
 *
 * A ceiling exists because `Number.isInteger(1e21)` is `true`: a lower-edge
 * check alone accepts a number that restores the unbounded queue this module
 * was written to remove, behind an API that documents itself as bounded.
 */
export const MAX_BUFFER_SIZE = 1_000_000

/** Every accepted overflow policy. An unrecognised value is refused, not defaulted. */
export const OVERFLOW_POLICIES = ['drop-oldest', 'drop-newest'] as const

/** What a full buffer does with the next frame. */
export type OverflowPolicy = typeof OVERFLOW_POLICIES[number]

/**
 * The default: keep the newest frames.
 *
 * A slow consumer gets recent state, which is what a dashboard or a devtools
 * panel wants. `drop-newest` was considered and rejected: a stream that
 * saturates once would never become useful again, serving a frozen past while
 * the present is discarded.
 */
export const DEFAULT_OVERFLOW: OverflowPolicy = 'drop-oldest'

/** How a caller shapes a stream's buffer. */
export interface StreamOptions {
    /**
     * Frames held before dropping starts. `1..MAX_BUFFER_SIZE`.
     *
     * **A developer-supplied constant.** Never derive it from request input:
     * the point of the bound is that a client cannot choose it.
     */
    bufferSize?: number
    /** What a full buffer does. Defaults to `'drop-oldest'`. */
    onOverflow?: OverflowPolicy
}

/**
 * What an overflow episode reports.
 *
 * **Deliberately closed, and deliberately without the frame.** The dropped
 * frame is an event payload — for the framework's own events, one holding the
 * request `Context` with its headers and session cookie. This report is on by
 * default, unlike debug output, so it is the one line no flag protects; a
 * typed record is what makes the payload unrepresentable rather than merely
 * discouraged.
 *
 * The narrow claim, stated precisely: **this writer** cannot carry a payload,
 * and neither can `debugLog`. The package as a whole still can — `emit()`'s
 * catch logs the error object a listener threw, and a listener handed the
 * `Context` can throw a value derived from it. That is the ordinary
 * log-the-error pattern and is left as it is; what is not left is the broader
 * claim, which was wrong.
 */
export interface OverflowReport {
    /** The event name the stream is bound to, or `'*'` for a wildcard stream. */
    readonly event: string
    /** Frames dropped so far in this episode. */
    readonly dropped: number
    /** The bound that was reached. */
    readonly bufferSize: number
    /** Whether the episode has ended — `false` on the first drop, `true` on recovery or close. */
    readonly ended: boolean
}

/** What {@link createEventQueue} hands back. */
export interface EventQueue<T> {
    /** Offer a frame. Drops per the policy when the buffer is full. */
    push(value: T): void
    /** End the stream and detach. Idempotent. */
    close(): void
    /** The consumer side. Ending it — `return()`, `break`, `throw` — closes the queue. */
    stream: AsyncIterableIterator<T>
}

/**
 * Validate a buffer size, or say exactly what is wrong with it.
 *
 * @param size - The requested size.
 * @returns The size, when it is acceptable.
 * @throws {RangeError} Naming the bound it broke.
 */
function validateBufferSize(size: number): number {
    if (!Number.isInteger(size) || size < 1 || size > MAX_BUFFER_SIZE) {
        throw new RangeError(
            `bufferSize must be an integer between 1 and ${MAX_BUFFER_SIZE}, received ${size}. ` +
                `It is a developer-supplied constant — never derive it from request input.`,
        )
    }
    return size
}

/**
 * A bounded queue with an async-iterable consumer side.
 *
 * @param event - The event name, used only in an overflow report.
 * @param detach - Removes the listener feeding this queue. Called once, on close.
 * @param options - Buffer size and overflow policy.
 * @param report - Where an overflow episode is reported. Defaults to `console.warn`.
 * @returns The producer side, the closer, and the stream.
 * @throws {RangeError} If `bufferSize` is outside its bounds.
 * @throws {TypeError} If `onOverflow` names no known policy.
 *
 * @example
 * ```ts
 * const queue = createEventQueue<number>('tick', () => emitter.off('tick', push))
 * for await (const value of queue.stream) console.log(value)
 * ```
 */
export function createEventQueue<T>(
    event: string,
    detach: () => void,
    options: StreamOptions = {},
    report: (r: OverflowReport) => void = defaultReport,
): EventQueue<T> {
    const bufferSize = validateBufferSize(
        options.bufferSize ?? DEFAULT_BUFFER_SIZE,
    )
    const policy = options.onOverflow ?? DEFAULT_OVERFLOW

    if (!OVERFLOW_POLICIES.includes(policy)) {
        throw new TypeError(
            `onOverflow must be one of: ${
                OVERFLOW_POLICIES.join(', ')
            }. Received "${policy}".`,
        )
    }

    const buffer: T[] = []
    const waiting: Array<(result: IteratorResult<T>) => void> = []
    let closed = false
    // An episode is a contiguous run of drops. Reported when it starts and when
    // it ends, never once per dropped frame — under a stalled consumer that
    // would be one line per event, which is the log flood the report exists to
    // replace.
    let dropped = 0

    const endEpisode = () => {
        if (dropped === 0) return
        report({ event, dropped, bufferSize, ended: true })
        dropped = 0
    }

    const close = (): void => {
        if (closed) return
        closed = true
        endEpisode()
        detach()
        // Nobody is left waiting on a stream that has ended.
        while (waiting.length > 0) {
            waiting.shift()!({ value: undefined as never, done: true })
        }
    }

    const stream: AsyncIterableIterator<T> = {
        [Symbol.asyncIterator]() {
            return stream
        },

        next(): Promise<IteratorResult<T>> {
            if (buffer.length > 0) {
                const value = buffer.shift() as T
                if (buffer.length === 0) endEpisode()
                return Promise.resolve({ value, done: false })
            }
            if (closed) {
                return Promise.resolve({
                    value: undefined as never,
                    done: true,
                })
            }
            return new Promise<IteratorResult<T>>((resolve) => {
                waiting.push(resolve)
            })
        },

        // `break` out of a `for await` calls this.
        return(): Promise<IteratorResult<T>> {
            close()
            return Promise.resolve({ value: undefined as never, done: true })
        },

        // A MANUAL `.throw()` calls this. `for await` does not: measured, a
        // body that throws triggers `return()`, exactly as `break` does — so
        // `return()` above is what covers both, and this is the extra door.
        // It closes too, or a caller driving the iterator by hand leaks.
        throw(error?: unknown): Promise<IteratorResult<T>> {
            close()
            return Promise.reject(error)
        },
    }

    return {
        push(value: T): void {
            if (closed) return

            const waiter = waiting.shift()
            if (waiter) {
                endEpisode()
                waiter({ value, done: false })
                return
            }

            if (buffer.length < bufferSize) {
                endEpisode()
                buffer.push(value)
                return
            }

            if (policy === 'drop-oldest') {
                buffer.shift()
                buffer.push(value)
            }
            // 'drop-newest': the frame is simply not taken.

            dropped++
            // Only the first drop of an episode is reported as it happens; the
            // total follows when the episode ends.
            if (dropped === 1) {
                report({ event, dropped, bufferSize, ended: false })
            }
        },

        close,
        stream,
    }
}

/**
 * Where an overflow goes when the caller names nowhere.
 *
 * `console.warn`, and only the three safe fields — never the frame.
 */
function defaultReport(r: OverflowReport): void {
    const what = r.ended
        ? `dropped ${r.dropped} event(s)`
        : `is full and has started dropping events`
    // Encoded, like every other line this package writes. This one matters more
    // than the debug lines, not less: those are off by default and this one is
    // not.
    //
    // An earlier version of this comment claimed it was "the only unencoded
    // write left in the package". That was false when written — `mod.ts` had
    // three, since fixed. The claim is dropped rather than restated, because a
    // "this is the last one" assertion is exactly the kind that rots.
    console.warn(
        `⚠️  Event stream for "${
            safeForLog(r.event)
        }" ${what} (buffer ${r.bufferSize}). ` +
            `Nothing is consuming it fast enough.`,
    )
}
