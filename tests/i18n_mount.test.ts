/**
 * App-level guard for the i18n mount fix (#95).
 *
 * The core tests build their own constrained pattern, so they prove the
 * *framework* honours a constraint — not that **this app** ships one. Reverting
 * `config/routing.ts` to the literal `/:langId/:countryId` leaves every one of
 * them green, including the `.well-known` test.
 *
 * These boot the real `mountPointConfig`, so that revert fails here.
 */

import { assertEquals } from '@std/assert'
import { App, type Context } from '@lockness/core'
import { Controller, Get } from '@lockness/core'
import { mountPointConfig } from '../config/routing.ts'
import { i18nMiddleware } from '../app/middleware/i18n_middleware.ts'
import { validCountries, validLanguages } from '../config/i18n.ts'

@Controller('/')
class ProbeController {
    @Get('/')
    home(c: Context) {
        return c.json({ page: 'home', locale: c.get('localeKey') })
    }
}

async function bootRealApp() {
    const app = new App()
    await app.init({
        controllers: [ProbeController],
        mountPoint: mountPointConfig,
    })
    return app
}

Deno.test('#95 - the shipped mount pattern is constrained, not a literal', () => {
    // Pins FR-004: the pattern is DERIVED from config/i18n.ts. A hand-written
    // literal — constrained or not — is a second spelling of the code lists.
    for (const lang of validLanguages) {
        assertEquals(
            mountPointConfig.pattern.includes(lang),
            true,
            `pattern must carry the configured language ${lang}`,
        )
    }
    for (const country of validCountries) {
        assertEquals(
            mountPointConfig.pattern.includes(country),
            true,
            `pattern must carry the configured country ${country}`,
        )
    }

    // The non-capturing group is what stops the alternation matching across
    // segment content — see the A1 finding in the plan.
    assertEquals(mountPointConfig.pattern.includes('(?:'), true)
})

Deno.test('#95 - DevTools probe does not reach the shipped i18n middleware', async () => {
    const app = await bootRealApp()

    // A 404 alone proves NOTHING here: the buggy version 404s from inside the
    // middleware and the fixed version 404s from the router. What discriminates
    // them is that the real i18nMiddleware logs an invariant violation at ERROR
    // before refusing — so an empty error log means it never ran.
    const errors: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => void errors.push(args.join(' '))

    let status: number
    try {
        const res = await app.fetch(
            new Request(
                'http://localhost/.well-known/appspecific/com.chrome.devtools.json',
            ),
        )
        status = res.status
    } finally {
        console.error = original
    }

    assertEquals(status, 404)
    assertEquals(
        errors.filter((e) => e.includes('i18n:')),
        [],
        'the locale middleware must not have run for a .well-known path',
    )
})

Deno.test('#95 - the console.error oracle can actually fire (positive control)', async () => {
    // The test above asserts an EMPTY set, which passes trivially if the log
    // prefix ever changes. This is its other half: with an UNCONSTRAINED mount
    // the same probe DOES reach the real middleware, so the oracle must fire.
    // If this goes green-and-silent, the test above is no longer proving
    // anything.
    const app = new App()
    await app.init({
        controllers: [ProbeController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    const errors: string[] = []
    const originalError = console.error
    const originalWarn = console.warn
    console.error = (...args: unknown[]) => void errors.push(args.join(' '))
    console.warn = () => {}

    try {
        await app.fetch(
            new Request(
                'http://localhost/.well-known/appspecific/com.chrome.devtools.json',
            ),
        )
    } finally {
        console.error = originalError
        console.warn = originalWarn
    }

    assertEquals(
        errors.filter((e) => e.includes('i18n:')).length,
        1,
        'an unconstrained mount must reach the middleware and log once',
    )
})

Deno.test('#95 - a mounted app still accepts post-init() registration', async () => {
    // probeCompile seals the ROOT router at init(). This pins the other half of
    // why that is safe: the public post-init() surfaces operate on the internal
    // app, so they are unaffected by the seal.
    const app = await bootRealApp()

    app.static('/assets/*', 'public')

    const res = await app.fetch(new Request('http://localhost/fr/ca'))
    assertEquals(res.status, 200)
})

Deno.test('#95 - a real locale still resolves, mount root included', async () => {
    const app = await bootRealApp()

    const root = await app.fetch(new Request('http://localhost/fr/ca'))
    assertEquals(root.status, 200)
    assertEquals((await root.json()).locale, 'fr-ca')

    const bare = await app.fetch(new Request('http://localhost/'))
    assertEquals(bare.status, 200)
    assertEquals((await bare.json()).locale, undefined)
})

Deno.test('#95 - a mounted app still installs its 404 handler after the boot probe', async () => {
    // probeCompile() builds and SEALS the root router at init(). This pins the
    // invariant that makes that safe: the bootstrap step which runs after it
    // installs a notFound handler (a property, not a route), so it still works.
    const app = await bootRealApp()

    const res = await app.fetch(new Request('http://localhost/no/such/route'))

    assertEquals(res.status, 404)
})
