/**
 * @fileoverview Tests for Translator + CatalogRegistry — SC-001/003/007.
 *
 * @module @lockness/i18n/tests/translator
 */

import { assert, assertEquals } from '@std/assert'
import { CatalogRegistry } from '../registry.ts'
import { flattenMessages } from '../translator.ts'

Deno.test('flattenMessages dot-keys a nested catalog', () => {
    const flat = flattenMessages({ auth: { failed: 'Nope' }, hi: 'Hi' })
    assertEquals(flat.get('auth.failed'), 'Nope')
    assertEquals(flat.get('hi'), 'Hi')
})

Deno.test('SC-001: t() interpolates and applies plurals', () => {
    const r = new CatalogRegistry({
        'en-us': {
            'cart.items': '{count, plural, one {# item} other {# items}}',
        },
    }, { defaultLocale: 'en-us' })
    const t = r.translator('en-us')
    assertEquals(t.t('cart.items', { count: 1 }), '1 item')
    assertEquals(t.t('cart.items', { count: 5 }), '5 items')
})

Deno.test('SC-001: a missing key returns the key string, never throws', () => {
    const r = new CatalogRegistry({ 'en-us': {} }, { defaultLocale: 'en-us' })
    assertEquals(r.translator('en-us').t('nope.missing'), 'nope.missing')
})

Deno.test('SC-003: per-key language cascade en-us → en → default', () => {
    const r = new CatalogRegistry({
        'en-us': { hi: 'Hi (US)' }, // has hi, not bye
        'en': { bye: 'Bye (en)' }, // has bye
        'fr-fr': { hi: 'Salut' },
    }, { defaultLocale: 'fr-fr' })
    const t = r.translator('en-us')
    assertEquals(t.t('hi'), 'Hi (US)') // from en-us
    assertEquals(t.t('bye'), 'Bye (en)') // cascaded to en
})

Deno.test('SC-003: an unknown locale falls back to the default catalog', () => {
    const r = new CatalogRegistry({
        'en-us': { hi: 'Hi' },
    }, { defaultLocale: 'en-us' })
    assertEquals(r.translator('de-de').t('hi'), 'Hi') // de-de → default en-us
})

Deno.test('SC-007: t() returns a plain string (not an HtmlEscapedString)', () => {
    const r = new CatalogRegistry({
        'en-us': { greet: 'Hi {name}' },
    }, { defaultLocale: 'en-us' })
    const out = r.translator('en-us').t('greet', { name: '<script>' })
    // t() does NOT escape — it returns the literal; the view layer escapes.
    assertEquals(typeof out, 'string')
    assertEquals(out, 'Hi <script>')
    assert(!(out as unknown as { isEscaped?: boolean }).isEscaped)
})

Deno.test('the registry memoises translators per locale', () => {
    const r = new CatalogRegistry({ 'en-us': {} }, { defaultLocale: 'en-us' })
    assert(r.translator('en-us') === r.translator('en-us'))
})
