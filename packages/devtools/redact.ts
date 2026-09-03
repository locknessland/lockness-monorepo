/**
 * @fileoverview Central redaction for the devtools collector.
 *
 * The collector records session contents, request headers, query parameters and
 * JSON bodies — any of which may hold auth tokens, cookies, CSRF secrets or
 * credentials — and re-serves them from `/_devtools/api/data`. Redaction happens
 * **once, at capture** (never per-panel), so no secret value reaches the
 * collector, a panel, or that JSON.
 *
 * Redaction is **by key name**, not by value: a secret stored under a
 * non-secret-looking key (e.g. `{ note: 'Bearer …' }`, or an OAuth code under a
 * benign param name other than `code`/`state`) is **not** caught. This is an
 * inherent limitation of name-based masking, stated here so it is a known
 * boundary rather than a silent gap.
 *
 * @module @lockness/devtools/redact
 */

/**
 * Names whose values are masked (matched case-insensitively): `password`,
 * `passwd`, `pwd`, `token`, `secret`, `credential`, `signature`, `authorization`,
 * `csrf`, `cookie`, `apikey`, a `key` token delimited by `_ . -` or the string
 * ends, and `code` / `state` as **standalone tokens only** (so `?code=`/`?state=`
 * mask while `statusCode` / `zipcode` / `stateName` stay visible).
 */
const SECRET_KEY =
    /password|passwd|pwd|token|secret|credential|signature|authorization|csrf|cookie|apikey|(^|[_.-])key([_.-]|$)|(^|[_.-])(code|state)([_.-]|$)/i

/**
 * Matches a `key` token at a **camelCase** boundary (a lowercase letter or digit
 * immediately before an uppercase `K`), e.g. `sessionKey`, `signingKey`,
 * `privateKey`. Case-sensitive on purpose: `monkey` / `donkey` have no camelCase
 * boundary and must stay visible.
 */
const CAMEL_SECRET_KEY = /[a-z0-9]Key([_.-]|$|[A-Z])/

/** The placeholder shown in place of a secret value. */
export const REDACTED = '[redacted]'

/** Deepest object level traversed before a subtree is masked wholesale. */
const MAX_DEPTH = 64

/**
 * Whether a field/header/param name is considered secret.
 *
 * The **single decider** for the secret vocabulary — every asker (session,
 * headers, query, body) reaches it through {@link redactValue}. It combines the
 * case-insensitive {@link SECRET_KEY} tokens with the case-sensitive
 * {@link CAMEL_SECRET_KEY} camelCase-`*Key` rule.
 *
 * @param key - The field name to test.
 * @returns True when the value under `key` must be masked.
 */
function isSecretKey(key: string): boolean {
    return SECRET_KEY.test(key) || CAMEL_SECRET_KEY.test(key)
}

/**
 * Recursively mask secret-keyed values in an arbitrary value.
 *
 * The **single masking home**. Traverses plain objects and arrays (including a
 * top-level array) to any depth, replacing a value whose key matches
 * {@link isSecretKey} with {@link REDACTED} and returning scalar / `null` leaves
 * unchanged. It is **total** — it never throws:
 *
 * - a subtree deeper than {@link MAX_DEPTH} is masked wholesale (bounds an
 *   adversarially deep JSON body — a DoS vector for a naive recursion), and
 * - a value already on the current path is masked (bounds a cyclic in-memory
 *   value, which a non-JSON session store can hold).
 *
 * A shared (non-cyclic) reference reached by two sibling branches is still
 * traversed in each — the visited set is an ancestor path, popped on the way out.
 *
 * @param value - Any value (record, array, scalar, `null`, `undefined`).
 * @returns A redacted copy of `value` (same shape for objects/arrays).
 *
 * @example
 * ```typescript
 * redactValue({ userId: 7, profile: { apiToken: 'sk-…' }, sessionKey: 'k' })
 * // { userId: 7, profile: { apiToken: '[redacted]' }, sessionKey: '[redacted]' }
 * ```
 */
export function redactValue(value: unknown): unknown {
    return redactInner(value, 0, new WeakSet<object>())
}

/**
 * Depth- and cycle-bounded worker for {@link redactValue}.
 *
 * @param value - The current value.
 * @param depth - The current nesting depth.
 * @param seen - The set of ancestor objects on the current path.
 * @returns The redacted value.
 */
function redactInner(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
): unknown {
    if (value === null || typeof value !== 'object') return value
    if (depth >= MAX_DEPTH) return REDACTED
    if (seen.has(value)) return REDACTED

    seen.add(value)
    let result: unknown
    if (Array.isArray(value)) {
        result = value.map((v) => redactInner(v, depth + 1, seen))
    } else {
        const out: Record<string, unknown> = {}
        for (
            const [key, v] of Object.entries(value as Record<string, unknown>)
        ) {
            out[key] = isSecretKey(key)
                ? REDACTED
                : redactInner(v, depth + 1, seen)
        }
        result = out
    }
    seen.delete(value)
    return result
}

/**
 * Return a redacted copy of a record, masking secret-looking values at any depth.
 *
 * A thin record-typed convenience wrapper over {@link redactValue} for the
 * common case where the caller already holds a `Record` (session data/flash,
 * request headers, query). The key is preserved (so a panel shows what is
 * present); only a secret-keyed value is replaced with {@link REDACTED}.
 *
 * @param data - The record to redact.
 * @returns A new record with secret values masked (deeply).
 *
 * @example
 * ```typescript
 * redactSecrets({ userId: 7, apiKey: 'sk-live-…' })
 * // { userId: 7, apiKey: '[redacted]' }
 * ```
 */
export function redactSecrets(
    data: Record<string, unknown>,
): Record<string, unknown> {
    return redactValue(data) as Record<string, unknown>
}
