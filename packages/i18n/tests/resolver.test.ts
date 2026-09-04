/**
 * @fileoverview Tests for lazy locale resolution — SC-004/005/008.
 *
 * Driven with a fake context for each source; a hostile/over-cap/control-char
 * value never becomes the resolved locale (falls back to default).
 *
 * @module @lockness/i18n/tests/resolver
 */

import { assertEquals } from '@std/assert'
import type { Context } from '@lockness/hono'
import { configureI18n, resetI18n } from '../config.ts'
import { resolveLocale } from '../resolver.ts'

function fakeContext(
    opts: { localeKey?: string; cookie?: string; acceptLanguage?: string },
): Context {
    const store = new Map<string, unknown>()
    if (opts.localeKey) store.set('localeKey', opts.localeKey)
    const headers = new Headers()
    if (opts.cookie) headers.set('cookie', opts.cookie)
    if (opts.acceptLanguage) headers.set('accept-language', opts.acceptLanguage)
    return {
        get: (k: string) => store.get(k),
        set: (k: string, v: unknown) => store.set(k, v),
        req: {
            raw: { headers },
            header: (name: string) => headers.get(name) ?? undefined,
        },
    } as unknown as Context
}

function setup() {
    configureI18n({
        catalogs: { 'en-us': { hi: 'Hi' }, 'fr-fr': { hi: 'Salut' } },
        defaultLocale: 'en-us',
    })
}

Deno.test('SC-004: route wins over cookie over header', () => {
    setup()
    try {
        assertEquals(
            resolveLocale(fakeContext({
                localeKey: 'fr-fr',
                cookie: 'locale=en-us',
                acceptLanguage: 'en',
            })),
            'fr-fr',
        )
    } finally {
        resetI18n()
    }
})

Deno.test('SC-004: cookie wins over header when no route', () => {
    setup()
    try {
        assertEquals(
            resolveLocale(fakeContext({
                cookie: 'locale=fr-fr',
                acceptLanguage: 'en',
            })),
            'fr-fr',
        )
        assertEquals(
            resolveLocale(fakeContext({ acceptLanguage: 'fr' })),
            'fr-fr', // header 'fr' → a CONFIGURED representative, never the raw tag
        )
    } finally {
        resetI18n()
    }
})

Deno.test('a language-only match resolves to a configured representative, not the raw tag', () => {
    setup()
    try {
        // 'fr-ca' is not configured, but language 'fr' is (fr-fr) → representative.
        assertEquals(
            resolveLocale(fakeContext({ cookie: 'locale=fr-ca' })),
            'fr-fr',
        )
    } finally {
        resetI18n()
    }
})

Deno.test('SC-005: only the first N Accept-Language ranges are parsed (range cap)', () => {
    setup()
    try {
        // 30 short unknown ranges (well under the 256-byte cap) then 'fr' — the
        // known tag sits past the 20-range cap, so it is never reached → default.
        const header = Array(30).fill('zz').join(',') + ',fr'
        assertEquals(header.length < 256, true)
        assertEquals(
            resolveLocale(fakeContext({ acceptLanguage: header })),
            'en-us',
        )
    } finally {
        resetI18n()
    }
})

Deno.test('SC-005: a hostile/unknown/over-cap value falls back to default, never selected raw', () => {
    setup()
    try {
        // Path-traversal-shaped, control-char, and over-cap all → default.
        assertEquals(
            resolveLocale(fakeContext({ cookie: 'locale=../../etc/passwd' })),
            'en-us',
        )
        // A control-char value on the route source (Headers itself rejects CRLF,
        // so route — c.get — is the vector that can carry one) → default.
        assertEquals(
            resolveLocale(fakeContext({ localeKey: 'en\n[ERROR] forged' })),
            'en-us',
        )
        assertEquals(
            resolveLocale(
                fakeContext({ acceptLanguage: 'x'.repeat(5000) }),
            ),
            'en-us',
        )
        // Unknown but well-formed → default (no 'de' catalog or language).
        assertEquals(
            resolveLocale(fakeContext({ cookie: 'locale=de-de' })),
            'en-us',
        )
    } finally {
        resetI18n()
    }
})

Deno.test('with no source present, resolves to the default', () => {
    setup()
    try {
        assertEquals(resolveLocale(fakeContext({})), 'en-us')
    } finally {
        resetI18n()
    }
})
