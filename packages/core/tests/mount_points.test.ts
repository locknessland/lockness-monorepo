/**
 * Tests for mount point routing strategy
 * Validates dual-layer routing architecture with mount point
 */

import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { Context, Next } from '../types.ts'
import { Controller, Get, Post } from '../routing/decorators.ts'

// Test controller for mount point testing
@Controller('/users')
class UserController {
    @Get('/')
    list(c: Context) {
        return c.json({ users: [], context: c.get('testContext') })
    }

    @Get('/:id')
    show(c: Context) {
        const id = c.req.param('id')
        return c.json({ id, user: { id } })
    }

    @Post('/')
    create(c: Context) {
        return c.json({ created: true }, 201)
    }
}

@Controller('/products')
class ProductController {
    @Get('/')
    list(c: Context) {
        const locale = c.get('locale')
        return c.json({ products: [], locale })
    }
}

Deno.test('App - mounts at root when no mountPoint defined', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
    })

    const res = await app.fetch(new Request('http://localhost/users'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(Array.isArray(data.users), true)
})

Deno.test('App - controllers accessible at root path parameter routes', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
    })

    const res = await app.fetch(new Request('http://localhost/users/123'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.id, '123')
})

Deno.test('App - mounts controllers under mount point pattern', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Should work under mount point
    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(Array.isArray(data.users), true)
})

Deno.test('App - routes accessible at root AND under mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Should work at root
    const rootRes = await app.fetch(new Request('http://localhost/users'))
    assertEquals(rootRes.status, 200)

    // Should also work under mount point
    const mountRes = await app.fetch(
        new Request('http://localhost/fr/ca/users'),
    )
    assertEquals(mountRes.status, 200)
})

Deno.test('App - executes mount-specific middleware', async () => {
    let middlewareCalled = false
    let extractedLang: string | undefined
    let extractedCountry: string | undefined

    const i18nMiddleware = async (c: Context, next: Next) => {
        middlewareCalled = true
        extractedLang = c.req.param('langId')
        extractedCountry = c.req.param('countryId')
        c.set('langId', extractedLang)
        c.set('countryId', extractedCountry)
        c.set('testContext', 'from-middleware')
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)

    // Verify middleware was called
    assertEquals(middlewareCalled, true)
    assertEquals(extractedLang, 'fr')
    assertEquals(extractedCountry, 'ca')

    // Verify context was set
    const data = await res.json()
    assertEquals(data.context, 'from-middleware')
})

Deno.test('App - middleware can set context values for controllers', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        const countryId = c.req.param('countryId')
        c.set('locale', `${langId}-${countryId}`)
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [ProductController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    const res = await app.fetch(new Request('http://localhost/en/us/products'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.locale, 'en-us')
})

Deno.test('App - middleware does not run for root access', async () => {
    let middlewareCalled = false

    const i18nMiddleware = async (c: Context, next: Next) => {
        middlewareCalled = true
        c.set('locale', `${c.req.param('langId')}-${c.req.param('countryId')}`)
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [ProductController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    // Access at root - middleware should NOT run
    const res = await app.fetch(new Request('http://localhost/products'))
    assertEquals(res.status, 200)
    assertEquals(middlewareCalled, false)

    const data = await res.json()
    assertEquals(data.locale, undefined)
})

Deno.test('App - middleware can reject invalid parameters', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        if (!['fr', 'en'].includes(langId)) {
            return c.notFound()
        }
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    // Valid language
    const validRes = await app.fetch(
        new Request('http://localhost/fr/ca/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid language
    const invalidRes = await app.fetch(
        new Request('http://localhost/de/de/users'),
    )
    assertEquals(invalidRes.status, 404)
})

Deno.test('App - middleware can return custom error responses', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        if (!['en', 'fr'].includes(langId)) {
            return c.json({ error: 'Unsupported language' }, 400)
        }
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    // Valid language
    const validRes = await app.fetch(
        new Request('http://localhost/en/us/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid language
    const invalidRes = await app.fetch(
        new Request('http://localhost/de/de/users'),
    )
    assertEquals(invalidRes.status, 400)
    const data = await invalidRes.json()
    assertEquals(data.error, 'Unsupported language')
})

Deno.test('App - 404 handler works with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Valid mount point but invalid route
    const res1 = await app.fetch(
        new Request('http://localhost/fr/ca/nonexistent'),
    )
    assertEquals(res1.status, 404)

    // Invalid path altogether
    const res2 = await app.fetch(
        new Request('http://localhost/invalid/path/here'),
    )
    assertEquals(res2.status, 404)
})

Deno.test('App - path parameters work in controller routes with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const res = await app.fetch(new Request('http://localhost/fr/ca/users/456'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.id, '456')
})

Deno.test('App - POST requests work with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const res = await app.fetch(
        new Request('http://localhost/fr/ca/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'John' }),
        }),
    )
    assertEquals(res.status, 201)

    const data = await res.json()
    assertEquals(data.created, true)
})

Deno.test('App - mount point works with multiple controllers', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController, ProductController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Test first controller
    const usersRes = await app.fetch(
        new Request('http://localhost/en/us/users'),
    )
    assertEquals(usersRes.status, 200)

    // Test second controller
    const productsRes = await app.fetch(
        new Request('http://localhost/fr/ca/products'),
    )
    assertEquals(productsRes.status, 200)
})

Deno.test('App - getRoutes() still works with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const routes = app.getRoutes()
    assertExists(routes)
    assertEquals(routes.length, 3) // GET /, GET /:id, POST /

    // Routes should show controller paths, not mount point
    const getUsersRoute = routes.find((r) => r.path === '/users')
    assertExists(getUsersRoute)
    assertEquals(getUsersRoute.method, 'GET')
})

// ---------------------------------------------------------------------------
// Mount-point ambiguity — see .specnaut/specs/001-fix-i18n-mount-ambiguity/
//
// These assert on OBSERVED MIDDLEWARE EXECUTION, not on status codes.
// A status-only assertion passes for the wrong reason here: the buggy and the
// fixed versions both return 404 for the reported path.
// ---------------------------------------------------------------------------

import { constrainedParam } from '../routing/mount_pattern.ts'

const LANGS = ['en', 'fr', 'es', 'de', 'ja']
const COUNTRIES = ['us', 'ca', 'mx', 'de', 'jp']

/** The constrained locale mount, built the way `config/routing.ts` builds it. */
const CONSTRAINED_PATTERN = `/${constrainedParam('langId', LANGS)}/${
    constrainedParam('countryId', COUNTRIES)
}`

@Controller('/')
class HomeController {
    @Get('/')
    home(c: Context) {
        return c.json({ page: 'home', locale: c.get('localeKey') })
    }
}

/** Builds an app with a locale mount and a middleware that records its own execution. */
async function appWithLocaleMount(pattern: string) {
    const seen: string[] = []

    const middleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        const countryId = c.req.param('countryId')
        seen.push(`${langId}/${countryId}`)
        if (!LANGS.includes(langId) || !COUNTRIES.includes(countryId)) {
            return c.notFound()
        }
        c.set('localeKey', `${langId}-${countryId}`)
        return await next()
    }

    const app = new App()
    await app.init({
        controllers: [HomeController, UserController],
        mountPoint: { pattern, middleware },
    })

    return { app, seen }
}

Deno.test('mount ambiguity - a .well-known path never reaches the mount middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    await app.fetch(
        new Request(
            'http://localhost/.well-known/appspecific/com.chrome.devtools.json',
        ),
    )

    // The observation that matters. Both the buggy and the fixed version
    // return 404 here, so the status code proves nothing.
    assertEquals(seen, [])
})

Deno.test('mount ambiguity - the unconstrained pattern DOES reach it (the bug being fixed)', async () => {
    const { app, seen } = await appWithLocaleMount('/:langId/:countryId')

    await app.fetch(
        new Request(
            'http://localhost/.well-known/appspecific/com.chrome.devtools.json',
        ),
    )

    // Pins the defect so the fix cannot silently regress.
    assertEquals(seen, ['.well-known/appspecific'])
})

Deno.test('mount ambiguity - a two-segment miss never reaches the mount middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    await app.fetch(new Request('http://localhost/css/missing.css'))

    assertEquals(seen, [])
})

Deno.test('mount ambiguity - a two-segment non-locale path does not resolve to the root route', async () => {
    const { app } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    const res = await app.fetch(new Request('http://localhost/foo/bar'))

    // `MountManager` mounts the whole app a second time under the pattern, so a
    // matching two-segment path would otherwise serve `@Get('/')`.
    assertEquals(res.status, 404)
})

// --- US2: valid locale routes keep working ---

Deno.test('mount ambiguity - a valid locale route still reaches the middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))

    assertEquals(res.status, 200)
    assertEquals(seen, ['fr/ca'])
})

Deno.test('mount ambiguity - an unsupported locale never reaches the middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    const res = await app.fetch(new Request('http://localhost/zz/zz/users'))

    assertEquals(res.status, 404)
    // The router rejects it now; the middleware is no longer the decider.
    assertEquals(seen, [])
})

// --- US5: the locale root keeps its locale (A10 / S1) ---
//
// This is the one the constraint BREAKS. Adding any constraint changes which
// Hono router compiles the pattern, and `<pattern>/*` stops matching a zero
// trailing segment — so the mount route serves `/fr/ca` while the mount
// middleware never runs. The page keeps its 200 and silently loses its locale.
//
// In a downstream app that puts tenant scoping in `mountPoint.middleware`,
// that is a gate that does not cover the tenant root.

Deno.test('mount ambiguity - the mount ROOT executes the mount middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    const res = await app.fetch(new Request('http://localhost/fr/ca'))
    const data = await res.json()

    assertEquals(res.status, 200)
    assertEquals(seen, ['fr/ca'])
    // Assert the context value, not the status: the status is 200 either way.
    assertEquals(data.locale, 'fr-ca')
})

Deno.test('mount ambiguity - every path the mount route serves also runs the mount gate', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    for (const path of ['/fr/ca', '/fr/ca/users', '/en/us', '/en/us/users']) {
        seen.length = 0
        const res = await app.fetch(new Request(`http://localhost${path}`))
        assertEquals(res.status, 200, `${path} should be served`)
        assertEquals(
            seen.length,
            1,
            `${path} should run the mount gate exactly once`,
        )
    }
})

// --- Framework hardening (FR-013, FR-014) ---

/** Captures `console.warn` for the duration of `run`. */
async function capturingWarnings(run: () => Promise<void>): Promise<string[]> {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '))
    try {
        await run()
    } finally {
        console.warn = original
    }
    return warnings
}

Deno.test('mount hardening - warns when an unconstrained mount gates traffic', async () => {
    const warnings = await capturingWarnings(async () => {
        await appWithLocaleMount('/:langId/:countryId')
    })

    const warning = warnings.find((w) => w.includes('Mount point'))
    assertExists(warning, 'expected a warning naming the offending mount')
    assertEquals(warning.includes(':langId'), true)
    assertEquals(warning.includes(':countryId'), true)
    // The message must carry the remedy, not just the complaint.
    assertEquals(warning.includes('constrainedParam'), true)
})

Deno.test('mount hardening - stays silent for a constrained mount', async () => {
    const warnings = await capturingWarnings(async () => {
        await appWithLocaleMount(CONSTRAINED_PATTERN)
    })

    assertEquals(warnings.filter((w) => w.includes('Mount point')), [])
})

Deno.test('mount hardening - stays silent for an unconstrained mount with no middleware', async () => {
    const warnings = await capturingWarnings(async () => {
        const app = new App()
        await app.init({
            controllers: [UserController],
            mountPoint: { pattern: '/:langId/:countryId' },
        })
    })

    // An unconstrained mount is a legal routing choice. Only the gate shape
    // — unconstrained *and* middleware-bearing — is the finding.
    assertEquals(warnings.filter((w) => w.includes('Mount point')), [])
})

Deno.test('mount hardening - a valid mount probe-compiles at boot and still serves', async () => {
    const { app } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    // The probe runs during init(); reaching here means it did not throw.
    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)
})

// --- US4: root access is unchanged ---

Deno.test('mount ambiguity - root access still bypasses the mount middleware', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    const res = await app.fetch(new Request('http://localhost/users'))

    assertEquals(res.status, 200)
    // Guards against a fix that accidentally makes the mount unconditional.
    assertEquals(seen, [])
})

Deno.test('mount ambiguity - an UNCONSTRAINED mount runs its middleware exactly once', async () => {
    // Back-compat guard. `${pattern}/*` already covers the mount root for an
    // unconstrained pattern, because Hono's tail wildcard matches the empty
    // tail. Registering the bare pattern as well made the gate fire TWICE
    // there, which silently breaks any non-idempotent middleware — a rate
    // limiter, a counter, an analytics hook — in every published consumer.
    const { app, seen } = await appWithLocaleMount('/:langId/:countryId')

    await app.fetch(new Request('http://localhost/fr/ca'))
    assertEquals(seen, ['fr/ca'])

    seen.length = 0
    await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(seen, ['fr/ca'])
})

Deno.test('mount ambiguity - a CONSTRAINED mount also runs it exactly once, trailing slash included', async () => {
    const { app, seen } = await appWithLocaleMount(CONSTRAINED_PATTERN)

    for (const path of ['/fr/ca', '/fr/ca/', '/fr/ca/users', '/en/us']) {
        seen.length = 0
        await app.fetch(new Request(`http://localhost${path}`))
        assertEquals(seen.length, 1, `${path} should run the gate exactly once`)
    }
})

Deno.test('mount ambiguity - the gate runs exactly once for every pattern shape', async () => {
    // Two static heuristics were tried before this and each mis-classified one
    // of these shapes, in the direction that double-fires a non-idempotent
    // gate. Whether `${pattern}/*` alone covers the mount root is not
    // predictable from the pattern text — these three disagree:
    //
    //   /:a/:b                     -> `/*` matches the empty tail
    //   /:a{(?:x|y)}/:b{(?:x|y)}   -> it does not
    //   /api/:v{(?:v1|v2)}         -> it does again, despite the constraint
    const shapes: Array<[string, string]> = [
        ['/:langId/:countryId', '/fr/ca'],
        ['/:langId{(?:en|fr)}/:countryId{(?:us|ca)}', '/fr/ca'],
        ['/:langId{(?:en|fr)}/:countryId', '/fr/ca'],
        ['/:langId/:countryId{(?:us|ca)}', '/fr/ca'],
        ['/:langId{(?:en|fr)}', '/fr'],
        ['/:langId', '/fr'],
    ]

    for (const [pattern, mountRoot] of shapes) {
        for (const path of [mountRoot, `${mountRoot}/users`]) {
            const { app, seen } = await appWithLocaleMount(pattern)
            await app.fetch(new Request(`http://localhost${path}`))
            assertEquals(
                seen.length,
                1,
                `${pattern} at ${path} must run the gate exactly once`,
            )
        }
    }
})
