/**
 * @fileoverview The one rule for what a withheld failure may still show: the
 * error's name, only when it is identifier-shaped and holds no form of the
 * password (#425). Shared by `Database` (driver failures) and `db:fresh` (a
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
 * The name a failure may show: identifier-shaped, and holding no form of the
 * password. A name is driver text like the message, so it is shown verbatim or
 * dropped — never edited.
 *
 * @param name - The error's `name`, as read.
 * @param passwords - Every known form of the password.
 * @returns The name, or `undefined` when it may not be shown.
 */
export function shownName(
    name: unknown,
    passwords: readonly string[],
): string | undefined {
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) return undefined
    return holdsPassword(name, passwords) ? undefined : name
}

/**
 * Whether a text holds any known form of the password.
 *
 * @param text - Driver text: a name, or a piece of a message.
 * @param passwords - Every known form of the password, none empty.
 * @returns True when any of them occurs in `text`.
 */
export function holdsPassword(
    text: string,
    passwords: readonly string[],
): boolean {
    return passwords.some((password) => text.includes(password))
}

/**
 * Read the name a withheld failure may show, from any thrown value.
 *
 * Reading an arbitrary thrown value can throw: `instanceof` on a Proxy, a
 * `name` getter. That is answered with {@link UNREADABLE_NAME}, which the
 * caller puts into the failure it reports — the failure is not swallowed.
 *
 * @param error - Whatever was thrown.
 * @param passwords - Every known form of the password; empty when none is
 *   known yet.
 * @returns The vetted name, {@link UNREADABLE_NAME}, or `undefined` when there
 *   is none to show.
 */
export function vettedErrorName(
    error: unknown,
    passwords: readonly string[],
): string | undefined {
    try {
        return shownName(
            error instanceof Error ? error.name : undefined,
            passwords,
        )
    } catch {
        return UNREADABLE_NAME
    }
}
