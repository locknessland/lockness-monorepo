/**
 * @fileoverview Central redaction for the devtools Sessions panel.
 *
 * The Sessions panel renders session contents, which may hold auth tokens, CSRF
 * secrets or credentials. Redaction happens **once, at capture** (never
 * per-panel), so no secret value reaches the collector, the panel, or the
 * `/api/data` JSON.
 *
 * @module @lockness/devtools/redact
 */

/** Keys whose values are masked (matched case-insensitively). */
const SECRET_KEY =
    /password|token|secret|authorization|csrf|apikey|(^|[_.-])key([_.-]|$)/i

/** The placeholder shown in place of a secret value. */
export const REDACTED = '[redacted]'

/**
 * Return a shallow copy of `data` with secret-looking values masked.
 *
 * The key is preserved (so the panel shows what is present); only the value is
 * replaced with {@link REDACTED} when the key matches a known secret pattern
 * (`password`, `token`, `secret`, `authorization`, `csrf`, `apikey`, or a `key`
 * segment).
 *
 * @param data - The record to redact.
 * @returns A new record with secret values masked.
 *
 * @example
 * ```typescript
 * redactSecrets({ userId: 7, apiKey: 'sk-live-...' })
 * // { userId: 7, apiKey: '[redacted]' }
 * ```
 */
export function redactSecrets(
    data: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
        out[key] = SECRET_KEY.test(key) ? REDACTED : value
    }
    return out
}
