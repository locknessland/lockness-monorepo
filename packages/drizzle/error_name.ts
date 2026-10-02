/**
 * @fileoverview The one rule for what a withheld failure may still show: the
 * error's name, only when it is identifier-shaped and holds no form of a
 * database credential (#425, #438). Shared by `Database` (driver failures) and `db:fresh` (a
 * `drizzle.config.ts` that cannot be imported, #435). Internal: not exported
 * from the package.
 *
 * @module
 * @internal
 */

/** The name shown when reading an error's name threw. */
export const UNREADABLE_NAME = '[unreadable name]'

/**
 * The error name a failure may show: a plain identifier, so a name an
 * application assigned cannot smuggle text in. It also rejects `[`, space and
 * `]`, so no name can forge {@link UNREADABLE_NAME}.
 */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]{0,63}$/

/**
 * The name a failure may show: identifier-shaped, and holding no form of a
 * credential. A name is driver text like the message, so it is shown verbatim
 * or dropped — never edited.
 *
 * @param name - The error's `name`, as read.
 * @param secrets - Every known form of every credential.
 * @returns The name, or `undefined` when it may not be shown.
 */
export function shownName(
    name: unknown,
    secrets: readonly string[],
): string | undefined {
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) return undefined
    return holdsSecret(name, secrets) ? undefined : name
}

/**
 * Whether a text holds any known form of any credential.
 *
 * Percent-hex escapes compare case-insensitively: a driver that re-encodes a
 * value may write `%2b` where the DSN had `%2B`, and both name the same byte.
 * Everything else compares exactly.
 *
 * @param text - Driver text: a name, or a piece of a message.
 * @param secrets - Every known form of every credential, none empty.
 * @returns True when any of them occurs in `text`.
 */
export function holdsSecret(
    text: string,
    secrets: readonly string[],
): boolean {
    if (secrets.length === 0) return false
    const haystack = upperHexEscapes(text)
    return secrets.some((secret) => haystack.includes(upperHexEscapes(secret)))
}

/** A `%XX` percent-hex escape. */
const HEX_ESCAPE = /%[0-9a-fA-F]{2}/g

/**
 * Uppercase the hex digits of every `%XX` escape, leaving the rest alone.
 *
 * @param text - Any text.
 * @returns The text with its escapes in one canonical case.
 */
function upperHexEscapes(text: string): string {
    if (!text.includes('%')) return text
    return text.replace(HEX_ESCAPE, (escape) => escape.toUpperCase())
}

/**
 * Read the name a withheld failure may show, from any thrown value.
 *
 * Reading an arbitrary thrown value can throw: `instanceof` on a Proxy, a
 * `name` getter. That is answered with {@link UNREADABLE_NAME}, which the
 * caller puts into the failure it reports — the failure is not swallowed.
 *
 * @param error - Whatever was thrown.
 * @param secrets - Every known form of every credential; empty when none is
 *   known yet.
 * @returns The vetted name, {@link UNREADABLE_NAME}, or `undefined` when there
 *   is none to show.
 */
export function vettedErrorName(
    error: unknown,
    secrets: readonly string[],
): string | undefined {
    try {
        return shownName(
            error instanceof Error ? error.name : undefined,
            secrets,
        )
    } catch {
        return UNREADABLE_NAME
    }
}
