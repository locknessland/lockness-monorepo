/**
 * @fileoverview Dev mail preview — a bounded capture store + a native handler.
 *
 * Security controls (S1/S2/S4):
 * - **Opt-in, default OFF** (`enableMailPreview()`); captures nothing otherwise.
 * - **Production fail-closed** — both capture and the handler refuse when
 *   `APP_ENV`/`DENO_ENV` is `production`, independent of the enable flag.
 * - **Bounded** — a ring buffer (oldest evicted) so a long dev session / soak
 *   test cannot exhaust memory.
 * - **XSS-contained** — a captured body is served **only** from a raw endpoint
 *   with `Content-Security-Policy: sandbox; default-src 'none'` + `nosniff`,
 *   never inlined into the list page; all metadata is HTML-encoded.
 *
 * The handler is a native `(Request) => Response` (no hono dep); mount it behind
 * the app's auth gate: `app.all(path, (c) => handler(c.req.raw))` — dev-gating
 * is not authorization.
 *
 * @module @lockness/mail/preview
 */

import type { MailMessage } from './types.ts'

/** A captured mail (dev only). */
export interface CapturedMail {
    /** A per-capture id. */
    id: string
    /** ISO capture time. */
    timestamp: string
    /** Recipient addresses, joined. */
    to: string
    /** The subject. */
    subject: string
    /** The rendered HTML body (or the text body). */
    body: string
}

let enabled = false
let max = 100
const store: CapturedMail[] = []

/** Environments the preview must never run in (prod-like — fail-closed, S2). */
const BLOCKED_ENVS = new Set(['production', 'prod', 'staging', 'preview'])

/**
 * Whether the preview must fail closed for the current environment — any
 * prod-like env (production / prod / staging / preview). An unset env is treated
 * as local development (the opt-in `enableMailPreview()` is the deliberate gate).
 */
function isProduction(): boolean {
    const env = (Deno.env.get('APP_ENV') ?? Deno.env.get('DENO_ENV'))
        ?.toLowerCase()
    return env !== undefined && BLOCKED_ENVS.has(env)
}

/**
 * Enable the dev preview (opt-in; no effect in production).
 *
 * @param options - `max` captured entries (default 100).
 */
export function enableMailPreview(options: { max?: number } = {}): void {
    if (isProduction()) return // never enable in production
    enabled = true
    if (options.max && options.max > 0) max = options.max
}

/** Disable + clear the preview. */
export function disableMailPreview(): void {
    enabled = false
    store.length = 0
}

/** Whether the preview is capturing. */
export function isMailPreviewEnabled(): boolean {
    return enabled && !isProduction()
}

/** Reset the preview — test-only. */
export function resetMailPreview(): void {
    enabled = false
    max = 100
    store.length = 0
}

/** The captured mails (most recent last). */
export function capturedMails(): readonly CapturedMail[] {
    return store
}

/**
 * Capture a sent message — the send→capture tap. A no-op unless the preview is
 * enabled and the environment is not production. Bounded (oldest evicted).
 *
 * @param message - The message being sent.
 */
export function capturePreview(message: MailMessage): void {
    if (!isMailPreviewEnabled()) return
    store.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        to: (message.to ?? []).map((a) => a.email).join(', '),
        subject: message.subject ?? '',
        body: message.html ?? message.text ?? '',
    })
    while (store.length > max) store.shift() // ring buffer
}

/** HTML-encode a value for safe embedding in the list chrome. */
function encode(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

/**
 * A native preview handler. `GET ?id=<id>` serves that mail's raw body inside a
 * sandbox CSP; any other request lists the captured mails (metadata encoded, no
 * body inlined). In production it always `404`s (S2).
 *
 * @returns A `(Request) => Response` handler.
 */
export function mailPreviewHandler(): (request: Request) => Response {
    return (request) => {
        if (isProduction()) return new Response('Not found', { status: 404 })
        const url = new URL(request.url)
        const id = url.searchParams.get('id')
        if (id) {
            const found = store.find((m) => m.id === id)
            if (!found) return new Response('Not found', { status: 404 })
            // The untrusted body is isolated: sandboxed, no capabilities, no
            // sniffing — it cannot script the tool origin (S1).
            return new Response(found.body, {
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'x-content-type-options': 'nosniff',
                    'content-security-policy': "sandbox; default-src 'none'",
                },
            })
        }
        // List page — metadata encoded, bodies only via the sandboxed ?id= link.
        const rows = store
            .slice()
            .reverse()
            .map((m) =>
                `<li><a href="?id=${encode(m.id)}">${encode(m.subject)}</a> — ${
                    encode(m.to)
                } <small>${encode(m.timestamp)}</small></li>`
            )
            .join('')
        return new Response(
            `<!doctype html><meta charset="utf-8"><title>Mail preview</title><h1>Captured mail (${store.length})</h1><ul>${rows}</ul>`,
            { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
    }
}
