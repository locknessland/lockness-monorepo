/**
 * @fileoverview Whether a failed command failed because the machine is
 * offline — the one reason a toolchain suite may skip instead of fail (#157,
 * #450).
 *
 * A suite that has to fetch a package (npm vite and tailwind here, drizzle-kit
 * and a kit's npm dependencies in `scripts/`) skips on a cold offline machine
 * with a printed reason, and only on a recognised network error: any other
 * failure fails. The recognition lives here once so the suites cannot drift.
 *
 * **Consumers outside this package** — a change here changes them too:
 * `scripts/kit_migrations_test.ts` and `scripts/kit_instructions_test.ts`.
 * This package's `AGENTS.md` names them as well.
 *
 * Not a `.test.ts` file, so `deno test` does not collect it.
 *
 * @module
 */

/** Network failures that are not a refused connection. */
const UNREACHABLE =
    /error sending request|failed to fetch|dns error|tcp connect error|network is unreachable|os error (50|51|65)|error trying to connect/i

/** A refused connection: ECONNREFUSED in words, or Linux's errno for it. */
const REFUSED = /connection refused|os error 111/i

/** How {@link isOffline} classifies. */
export interface OfflineOptions {
    /**
     * Whether a refused connection counts as offline. Off by default: a suite
     * that points its app at a closed loopback port on purpose needs a refusal
     * to fail, not to skip. Turn it on only for a command whose sole
     * connection is to a package registry.
     *
     * It gates only a BARE refusal. Deno's HTTP client reports a refused
     * registry as "error sending request … tcp connect error: Connection
     * refused", which matches as offline whatever this option says.
     */
    readonly refused?: boolean
}

/**
 * Whether a command's output is a recognised network failure.
 *
 * @param output - What the command printed (stderr, or both streams).
 * @param options - Whether a refused connection counts.
 * @returns True when the failure is the machine being offline.
 *
 * @example
 * ```ts
 * if (code !== 0 && isOffline(stderr, { refused: true })) {
 *     console.warn('skipped — toolchain unavailable offline')
 * }
 * ```
 */
export function isOffline(
    output: string,
    options: OfflineOptions = {},
): boolean {
    return UNREACHABLE.test(output) ||
        (options.refused === true && REFUSED.test(output))
}
