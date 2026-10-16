/**
 * @fileoverview The mail preview fails closed on an unreadable `APP_ENV`
 * (#624): it serves captured mail, password-reset links included, so a
 * process that cannot tell whether it is in production must not serve it.
 * An unset `APP_ENV` is still local development.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name**: the rows stub
 * Deno's env permission.
 *
 * @module @lockness/mail/tests/preview_unreadable
 */

import { assert, assertEquals } from '@std/assert'
import type { MailMessage } from '../types.ts'
import {
    capturedMails,
    capturePreview,
    enableMailPreview,
    isMailPreviewEnabled,
    mailPreviewHandler,
    resetMailPreview,
} from '../preview.ts'
import { withEnv } from '../../contract/tests/env_fixture.ts'
import { withUnreadableEnv } from '../../contract/tests/env_permission_fixture.ts'

const RESET = {
    to: [{ email: 'a@b.c' }],
    subject: 'Reset your password',
    html: '<a href="https://x/reset?token=t">reset</a>',
} as MailMessage

Deno.test('mail preview - an unreadable APP_ENV leaves enableMailPreview a no-op', async () => {
    resetMailPreview()
    await withEnv({ APP_ENV: undefined }, async () => {
        await withUnreadableEnv(['APP_ENV'], () => {
            enableMailPreview()
            capturePreview(RESET)
            assert(!isMailPreviewEnabled())
        })
    })
    assertEquals(capturedMails().length, 0)
    resetMailPreview()
})

Deno.test('mail preview - an unreadable APP_ENV 404s the route, even with mail captured earlier', async () => {
    resetMailPreview()
    await withEnv({ APP_ENV: undefined }, async () => {
        enableMailPreview()
        capturePreview(RESET)
        const id = capturedMails()[0].id
        const handler = mailPreviewHandler()
        const { result } = await withUnreadableEnv(['APP_ENV'], () => [
            handler(new Request('http://x/preview')).status,
            handler(new Request(`http://x/preview?id=${id}`)).status,
        ])
        assertEquals(result, [404, 404])
    })
    resetMailPreview()
})

Deno.test('mail preview - a readable, unset APP_ENV is still local development', () => {
    resetMailPreview()
    withEnv({ APP_ENV: undefined }, () => {
        enableMailPreview()
        assert(isMailPreviewEnabled())
        assertEquals(
            mailPreviewHandler()(new Request('http://x/preview')).status,
            200,
        )
    })
    resetMailPreview()
})
