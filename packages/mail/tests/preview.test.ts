/**
 * @fileoverview Tests for the dev mail preview — SC-006/006a (bounded, inert,
 * prod fail-closed).
 *
 * @module @lockness/mail/tests/preview
 */

import { assert, assertEquals } from '@std/assert'
import type { MailMessage } from '../types.ts'
import { configureMail, mail } from '../mod.ts'
import {
    capturedMails,
    capturePreview,
    disableMailPreview,
    enableMailPreview,
    mailPreviewHandler,
    resetMailPreview,
} from '../preview.ts'

function msg(subject: string, html: string): MailMessage {
    return { to: [{ email: 'a@b.c' }], subject, html } as MailMessage
}

Deno.test('SC-006: captures only when enabled', () => {
    resetMailPreview()
    capturePreview(msg('S1', '<p>1</p>')) // disabled → no-op
    assertEquals(capturedMails().length, 0)
    enableMailPreview()
    capturePreview(msg('S2', '<p>2</p>'))
    assertEquals(capturedMails().length, 1)
    resetMailPreview()
})

Deno.test('SC-006: the store is bounded (keeps the most recent N)', () => {
    resetMailPreview()
    enableMailPreview({ max: 3 })
    for (let i = 0; i < 5; i++) capturePreview(msg(`S${i}`, `<p>${i}</p>`))
    const kept = capturedMails()
    assertEquals(kept.length, 3)
    assertEquals(kept.map((m) => m.subject), ['S2', 'S3', 'S4']) // oldest evicted
    resetMailPreview()
})

Deno.test('SC-006a: a body is served only in a sandboxed CSP response; metadata encoded', () => {
    resetMailPreview()
    enableMailPreview()
    capturePreview(msg('<script>alert(1)</script>', '<img onerror=alert(1)>'))
    const handler = mailPreviewHandler()
    const id = capturedMails()[0].id

    // The raw-body endpoint carries the sandbox CSP + nosniff.
    const raw = handler(new Request(`http://x/preview?id=${id}`))
    assertEquals(
        raw.headers.get('content-security-policy'),
        "sandbox; default-src 'none'",
    )
    assertEquals(raw.headers.get('x-content-type-options'), 'nosniff')

    // The list page HTML-encodes the subject (never inlines the body / raw script).
    return handler(new Request('http://x/preview')).text().then((listHtml) => {
        assert(!listHtml.includes('<script>alert(1)</script>'))
        assert(listHtml.includes('&lt;script&gt;'))
        assert(!listHtml.includes('<img onerror')) // body not inlined into the list
        resetMailPreview()
    })
})

Deno.test('SC-006a: with APP_ENV=production the handler 404s and captures nothing', () => {
    const prior = Deno.env.get('APP_ENV')
    Deno.env.set('APP_ENV', 'production')
    try {
        resetMailPreview()
        enableMailPreview() // no effect in production
        capturePreview(msg('S', '<p>x</p>'))
        assertEquals(capturedMails().length, 0) // captured nothing
        const res = mailPreviewHandler()(new Request('http://x/preview'))
        assertEquals(res.status, 404)
    } finally {
        resetMailPreview()
        if (prior === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prior)
    }
})

Deno.test('the mail send() tap captures when the preview is enabled', async () => {
    configureMail({ driver: 'memory' })
    resetMailPreview()
    enableMailPreview()
    await mail().to('a@b.c').subject('Tapped').html('<p>x</p>').send()
    assert(capturedMails().some((m) => m.subject === 'Tapped'))
    resetMailPreview()
})

Deno.test('SC-006a: a prod-like env (staging) is fail-closed like production', () => {
    const prior = Deno.env.get('APP_ENV')
    Deno.env.set('APP_ENV', 'staging')
    try {
        resetMailPreview()
        enableMailPreview()
        capturePreview(msg('S', '<p>x</p>'))
        assertEquals(capturedMails().length, 0)
        assertEquals(
            mailPreviewHandler()(new Request('http://x/preview')).status,
            404,
        )
    } finally {
        resetMailPreview()
        if (prior === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prior)
    }
})

Deno.test('disableMailPreview clears the store', () => {
    resetMailPreview()
    enableMailPreview()
    capturePreview(msg('S', '<p>x</p>'))
    disableMailPreview()
    assertEquals(capturedMails().length, 0)
    resetMailPreview()
})
