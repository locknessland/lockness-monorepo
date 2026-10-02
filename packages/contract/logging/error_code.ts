/**
 * @fileoverview Decide whether an error's `code` may appear in a rendered log
 * line (#491).
 *
 * An operator triaging a failed command needs the SQLSTATE, the errno or the
 * `ERR_*` that says what went wrong, and `renderError` used to drop all of it
 * along with the rest of the object. `code` is the one property worth bringing
 * back, because every runtime and driver spells it from a small fixed
 * vocabulary — while `detail`, `hint`, `parameters` and their kin carry row
 * data that no redaction recognises.
 *
 * **The check limits the code's SHAPE, not its secrecy.** It admits only the
 * three spellings real codes use, which shuts out the shapes randomness takes
 * (a six-digit one-time password, a 20-character key id, a base32 seed), but a
 * five-character PIN or an application's upper-snake value carrying data would
 * still pass. That residue is accepted: `name` is already shown with no vetting
 * at all, and a code is strictly narrower than a name.
 *
 * Internal: `renderError` imports it; no entry point does.
 *
 * @module
 */

/**
 * Longest code shown, in characters.
 *
 * The longest real runtime code known is Node's 43-character
 * `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`; 48 leaves it room without
 * admitting a value long enough to be a payload.
 */
const MAX_CODE = 48

/**
 * The three vocabularies a runtime or driver code is spelled in.
 *
 * - **SQLSTATE**: exactly five of `[0-9A-Z]` — `23505`, `42P01`, Prisma's
 *   `P2002`.
 * - **POSIX errno**: `E` and one to fifteen uppercase letters — `ENOENT`,
 *   `ECONNREFUSED`, tedious's `ELOGIN`. Letters only, so `E482913` is not one.
 * - **Upper-snake with at least one underscore** — Node's `ERR_*`, mysql2's
 *   `ER_DUP_ENTRY`, `SQLITE_CONSTRAINT`, postgres.js's `CONNECT_TIMEOUT`,
 *   `EAI_AGAIN`. The underscore is what turns away a run of random uppercase
 *   characters, which is the shape of an access key id or a TOTP seed.
 *
 * No two quantifiers compete for one character, and the length is checked
 * before this runs, so there is no input that makes it backtrack badly.
 */
const ERROR_CODE =
    /^(?:[0-9A-Z]{5}|E[A-Z]{1,15}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/

/** What a code whose read threw renders as, inside the brackets. */
const UNREADABLE_CODE = 'unreadable code'

/**
 * Whether `value` is spelled like a runtime or driver error code.
 *
 * Strings only: a number, a `String` object or anything that merely
 * stringifies to a code is refused, because coercing it would run code the
 * renderer does not control.
 *
 * @param value - Whatever an error's `code` property held.
 * @returns `true` when `value` is a string of at most 48 characters in one of
 *   the three vocabularies.
 *
 * @example
 * ```typescript
 * isShowableErrorCode('23505')   // true — SQLSTATE
 * isShowableErrorCode('ENOENT')  // true — errno
 * isShowableErrorCode('482913')  // false — six digits, an OTP's shape
 * ```
 */
export function isShowableErrorCode(value: unknown): value is string {
    return typeof value === 'string' && value.length <= MAX_CODE &&
        ERROR_CODE.test(value)
}

/**
 * Read the code `renderError` shows beside an error's name.
 *
 * **The read has its own `try`, separate from the renderer's.** A getter can
 * throw; caught by the renderer's own guard, that would replace the name and
 * message with `[unrenderable error]` and lose the whole line to one property
 * nobody asked for. Caught here, the line keeps both and says the code was
 * there but could not be read — the same convention as `[unreadable cause]`.
 *
 * @param error - The error being rendered.
 * @returns The code when it passes {@link isShowableErrorCode}, the
 *   `unreadable code` sentinel when reading it threw, otherwise `undefined`.
 *   Never encoded: the caller encodes it with the rest of the line.
 */
export function readShownCode(error: Error): string | undefined {
    let code: unknown
    try {
        code = (error as Error & { code?: unknown }).code
    } catch {
        return UNREADABLE_CODE
    }
    return isShowableErrorCode(code) ? code : undefined
}
