/**
 * @fileoverview Tests for the accessors + ambient-t() ALS scope.
 *
 * @module @lockness/i18n/tests/context
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import type { Context } from '@lockness/hono'
import { configureI18n, getRegistry, resetI18n } from '../config.ts'
import {
    currentLocale,
    getTranslator,
    localeMiddleware,
    runWithLocale,
    t,
} from '../context.ts'

function fakeContext(localeKey?: string): Context {
    const store = new Map<string, unknown>()
    if (localeKey) store.set('localeKey', localeKey)
    return {
        get: (k: string) => store.get(k),
        set: (k: string, v: unknown) => store.set(k, v),
        req: { header: () => undefined },
    } as unknown as Context
}

function setup() {
    configureI18n({
        catalogs: { 'en-us': { hi: 'Hi' }, 'fr-fr': { hi: 'Salut' } },
        defaultLocale: 'en-us',
    })
}

Deno.test('getTranslator resolves + memoises on the context', () => {
    setup()
    try {
        const c = fakeContext('fr-fr')
        const first = getTranslator(c)
        assertEquals(first.t('hi'), 'Salut')
        assert(getTranslator(c) === first) // memoised
    } finally {
        resetI18n()
    }
})

Deno.test('getTranslator throws when i18n is unconfigured', () => {
    resetI18n()
    assertThrows(() => getTranslator(fakeContext()), Error, 'not configured')
})

Deno.test('runWithLocale makes ambient t() resolve inside the scope', () => {
    setup()
    try {
        const rendered = runWithLocale('fr-fr', () => {
            assertEquals(currentLocale(), 'fr-fr')
            return t('hi')
        })
        assertEquals(rendered, 'Salut')
    } finally {
        resetI18n()
    }
})

Deno.test('ambient t() throws outside a locale scope', () => {
    setup()
    try {
        assertThrows(() => t('hi'), Error, 'outside a locale scope')
    } finally {
        resetI18n()
    }
})

Deno.test('localeMiddleware sets c.get(locale)/c.get(t) and runs next() inside the ALS scope', async () => {
    setup()
    try {
        const c = fakeContext('fr-fr')
        let ambient: string | undefined
        let scopeLocale: string | undefined
        await localeMiddleware()(c, () => {
            // Inside next(): ambient t() and currentLocale() resolve via ALS.
            ambient = t('hi')
            scopeLocale = currentLocale()
            return Promise.resolve()
        })
        assertEquals(ambient, 'Salut')
        assertEquals(scopeLocale, 'fr-fr')
        assertEquals(c.get('locale' as never) as unknown, 'fr-fr')
        assert(c.get('t' as never)) // translator exposed on the context
    } finally {
        resetI18n()
    }
})

Deno.test('A-L1: the pure Translator works with no ALS scope (never reads ALS)', () => {
    setup()
    try {
        // Direct registry translator — no scope active — must still render.
        assertEquals(getRegistry().translator('fr-fr').t('hi'), 'Salut')
        assertEquals(currentLocale(), undefined) // no ambient scope leaked
    } finally {
        resetI18n()
    }
})
