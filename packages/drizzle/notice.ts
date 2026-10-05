/**
 * @fileoverview Where PostgreSQL server notices go (#454) — the one notice
 * policy every postgres.js client this package opens installs as `onnotice`.
 *
 * postgres.js's own default is `console.log(notice)`, which dumps the raw
 * notice object — `severity`, `code`, `file`, `line`, `routine` — on every
 * idempotent `CREATE … IF NOT EXISTS`. So each client gets this policy
 * instead: a `WARNING` is worth the user's attention and is reported as one
 * line; `NOTICE`, `INFO`, `LOG` and `DEBUG` are diagnostic chatter and go to
 * the debug channel.
 *
 * The {@link NoticeReporter} port is what lets a kernel app route notices to
 * `@lockness/logger` without this package importing it: core's database step
 * plugs the logger in when the kernel sets `logger: true`, the way it wires
 * the scheduler's reporter (#505).
 *
 * @module @lockness/drizzle/notice
 * @since 0.5.0
 */

import { safeForLog } from '@lockness/contract'

/**
 * Receives the PostgreSQL server notices a connection raises, already sorted
 * by severity.
 *
 * Synchronous on purpose: it runs inside postgres.js's socket handler, so an
 * implementation must neither throw nor block. An asynchronous sink (a logger)
 * is called without being awaited.
 *
 * The `message` and every string in `fields` are already encoded with
 * `safeForLog` — a notice can carry user data, for example from a
 * `RAISE NOTICE` in a SQL function — so an implementation may interpolate
 * them as they are.
 *
 * @example
 * ```ts
 * const notices: NoticeReporter = {
 *     warn: (message, fields) => myLog.warn(message, fields),
 *     debug: (message, fields) => myLog.debug(message, fields),
 * }
 * await db.connect(url, { notices })
 * ```
 */
export interface NoticeReporter {
    /**
     * A `WARNING`, or a notice whose severity is missing or unrecognised.
     *
     * @param message - The notice's message, encoded for logging.
     * @param fields - Whichever of `severity`, `code`, `detail`, `hint` and
     *   `where` the notice carries.
     */
    warn(message: string, fields: Readonly<Record<string, unknown>>): void
    /**
     * A `NOTICE`, `INFO`, `LOG` or `DEBUG` notice.
     *
     * @param message - The notice's message, encoded for logging.
     * @param fields - Whichever of `severity`, `code`, `detail`, `hint` and
     *   `where` the notice carries.
     */
    debug(message: string, fields: Readonly<Record<string, unknown>>): void
}

/**
 * The reporter used when no other is given — by every `db:*` command, by the
 * installer's probe, and by a kernel that does not set `logger: true`.
 *
 * - **`warn`** writes one stderr line: `⚠️  PostgreSQL warning: <message>`,
 *   plus ` — hint: <hint>` when the notice has one.
 * - **`debug`** discards the notice. That is a level policy, the same outcome
 *   as a logger at its default level, not a swallowed error: route notices to
 *   `@lockness/logger` with `logger: true`, or pass your own
 *   `ConnectionOptions.notices`, to see them.
 *
 * @example
 * ```ts
 * consoleNoticeReporter.warn('there is no transaction in progress', {})
 * // stderr: ⚠️  PostgreSQL warning: there is no transaction in progress
 * ```
 */
export const consoleNoticeReporter: NoticeReporter = {
    warn: (message, fields) => {
        const hint = typeof fields.hint === 'string'
            ? ` — hint: ${fields.hint}`
            : ''
        console.warn(`⚠️  PostgreSQL warning: ${message}${hint}`)
    },
    debug: () => {},
}

/** The severities that are diagnostic chatter rather than a warning. */
const DEBUG_SEVERITIES: ReadonlySet<string> = new Set([
    'NOTICE',
    'INFO',
    'LOG',
    'DEBUG',
])

/** The notice fields passed on to a reporter, when present. */
const FORWARDED_FIELDS = [
    'severity',
    'code',
    'detail',
    'hint',
    'where',
] as const

/** The message reported for a notice that is not an object. */
const UNREADABLE_NOTICE = '(unreadable PostgreSQL notice)'

/** The message reported for a notice object that has no string message. */
const NO_MESSAGE = '(PostgreSQL notice without a message)'

/**
 * Route one server notice to `reporter` by severity.
 *
 * | Severity                          | Goes to          |
 * | :-------------------------------- | :--------------- |
 * | `WARNING`                         | `reporter.warn`  |
 * | `NOTICE`, `INFO`, `LOG`, `DEBUG`  | `reporter.debug` |
 * | unrecognised or missing           | `reporter.warn`  |
 *
 * The notice is read defensively from `unknown`, so a malformed one is still
 * reported — as a warning, with a placeholder message — and this function
 * never throws on account of its input: postgres.js calls it from its socket
 * handler, where a throw would take the connection down.
 *
 * @param notice - What postgres.js passed to `onnotice`.
 * @param reporter - Where the notice goes.
 *
 * @example
 * ```ts
 * postgres(url, { onnotice: (n) => reportNotice(n, consoleNoticeReporter) })
 * ```
 */
export function reportNotice(notice: unknown, reporter: NoticeReporter): void {
    if (typeof notice !== 'object' || notice === null) {
        reporter.warn(UNREADABLE_NOTICE, {})
        return
    }
    const record = notice as Record<string, unknown>
    const fields: Record<string, string> = {}
    for (const name of FORWARDED_FIELDS) {
        const value = record[name]
        if (typeof value === 'string') fields[name] = safeForLog(value)
    }
    const message = typeof record.message === 'string'
        ? safeForLog(record.message)
        : NO_MESSAGE
    const severity = record.severity
    if (typeof severity === 'string' && DEBUG_SEVERITIES.has(severity)) {
        reporter.debug(message, fields)
    } else {
        reporter.warn(message, fields)
    }
}
