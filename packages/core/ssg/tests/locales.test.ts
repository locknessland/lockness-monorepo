/**
 * `expandTargetsForLocales` (#54, US2) — emitting each `@Static` page once at
 * root and once per **curated** locale, under the app's real mount prefix.
 *
 * The locale-URL prefix is derived from the kernel `mountPoint` (its authoring
 * home is `config/routing.ts`), never a literal restated here, and each locale is
 * validated against the mount pattern's own inline constraint — so a bad locale
 * fails the build and no import of app i18n config is needed. The curated list is
 * the only source of locales; the `validLanguages × validCountries` product is
 * never derived.
 *
 * @module @lockness/core/ssg/tests/locales
 */

import { assertEquals, assertThrows } from '@std/assert'
import { resolve } from '@std/path'
import { expandTargetsForLocales } from '../locales.ts'
import type { RenderTarget } from '../enumerate.ts'
import type { KernelConfig } from '../../kernel/kernel_decorators.ts'

const DIST = resolve('dist')
const MOUNT = '/:langId{(?:en|fr|es|de|ja)}/:countryId{(?:us|ca|mx|de|jp)}'

const t = (url: string): RenderTarget => ({
    url,
    outputPath: resolve(
        DIST,
        url === '/' ? 'index.html' : url.slice(1) + '/index.html',
    ),
    controller: 'C',
    action: 'a',
})

Deno.test('locales - no ssg.locales configured returns targets unchanged (root-only)', () => {
    const cfg: KernelConfig = {}
    const targets = [t('/'), t('/docs')]
    assertEquals(expandTargetsForLocales(targets, cfg, DIST), targets)
})

Deno.test('locales - emits root + one variant per curated locale', () => {
    const cfg: KernelConfig = {
        mountPoint: { pattern: MOUNT },
        ssg: { locales: ['en-us', 'fr-ca'] },
    }
    const out = expandTargetsForLocales([t('/docs')], cfg, DIST)
    assertEquals(out.map((x) => x.url).sort(), [
        '/docs',
        '/en/us/docs',
        '/fr/ca/docs',
    ])
})

Deno.test('locales - the root target localizes without a trailing slash', () => {
    const cfg: KernelConfig = {
        mountPoint: { pattern: MOUNT },
        ssg: { locales: ['en-us'] },
    }
    const out = expandTargetsForLocales([t('/')], cfg, DIST)
    assertEquals(out.map((x) => x.url).sort(), ['/', '/en/us'])
})

Deno.test('locales - a two-entry list yields 3 files for one route, never the 25-product (SC-004)', () => {
    const cfg: KernelConfig = {
        mountPoint: { pattern: MOUNT },
        ssg: { locales: ['en-us', 'fr-ca'] },
    }
    const out = expandTargetsForLocales([t('/docs')], cfg, DIST)
    assertEquals(out.length, 3)
})

Deno.test('locales - a locale the mount constraint rejects aborts', () => {
    const cfg: KernelConfig = {
        mountPoint: { pattern: MOUNT },
        ssg: { locales: ['xx-zz'] },
    }
    assertThrows(
        () => expandTargetsForLocales([t('/docs')], cfg, DIST),
        Error,
        'xx',
    )
})

Deno.test('locales - a locale with the wrong segment count aborts', () => {
    const cfg: KernelConfig = {
        mountPoint: { pattern: MOUNT },
        ssg: { locales: ['en'] },
    }
    assertThrows(() => expandTargetsForLocales([t('/docs')], cfg, DIST), Error)
})

Deno.test('locales - locales configured but no mountPoint aborts', () => {
    const cfg: KernelConfig = { ssg: { locales: ['en-us'] } }
    assertThrows(
        () => expandTargetsForLocales([t('/docs')], cfg, DIST),
        Error,
        'mountPoint',
    )
})
