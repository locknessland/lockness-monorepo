/**
 * `enumerateStaticTargets` + `loadControllers` (#54) — turning `@Static`
 * metadata + the app's registered routes into the concrete pages to render.
 *
 * The enumerator joins two single-home sources: the app's computed route paths
 * (`app.getRoutes()`, home = the route registry) and the `@Static` opt-in
 * (constructor metadata, home = the decorator). It never rebuilds route paths
 * itself. It validates GET-only, requires explicit `params` for a parameterized
 * route, expands a literal `params` list, and leaves non-`@Static` routes out.
 * `loadControllers` imports a controllers dir and is **fatal** on an import
 * failure (FR-012) — never the warn-and-skip `router:list` uses.
 *
 * @module @lockness/core/ssg/tests/enumerate
 */

import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { join, resolve } from '@std/path'
import { Controller, Get, Post, Static } from '@lockness/contract'
import type { ControllerWithMetadata } from '@lockness/contract'
import type { RouteInfo } from '../../app.ts'
import { enumerateStaticTargets, loadControllers } from '../enumerate.ts'

const DIST = resolve('dist')

/** A controller ref as the enumerator consumes it (metadata + class name). */
type Ref = ControllerWithMetadata & { readonly name: string }

// deno-lint-ignore no-explicit-any
const ref = (ctor: any): Ref => ctor as Ref

Deno.test('enumerate - includes @Static GET routes, excludes plain routes', () => {
    @Controller('/docs')
    class DocsCtrl {
        @Get('/')
        @Static()
        index() {}

        @Get('/about')
        about() {} // not static
    }
    new DocsCtrl()

    const routes: RouteInfo[] = [
        {
            method: 'GET',
            path: '/docs',
            controller: 'DocsCtrl',
            action: 'index',
            middlewares: [],
        },
        {
            method: 'GET',
            path: '/docs/about',
            controller: 'DocsCtrl',
            action: 'about',
            middlewares: [],
        },
    ]
    const targets = enumerateStaticTargets(routes, [ref(DocsCtrl)], {
        distRoot: DIST,
    })
    assertEquals(targets.length, 1)
    assertEquals(targets[0].url, '/docs')
    assertEquals(targets[0].outputPath, join(DIST, 'docs', 'index.html'))
})

Deno.test('enumerate - class-level @Static marks every GET route', () => {
    @Controller('/ui')
    @Static()
    class UiCtrl {
        @Get('/')
        index() {}
        @Get('/llms.txt')
        llms() {}
    }
    new UiCtrl()

    const routes: RouteInfo[] = [
        {
            method: 'GET',
            path: '/ui',
            controller: 'UiCtrl',
            action: 'index',
            middlewares: [],
        },
        {
            method: 'GET',
            path: '/ui/llms.txt',
            controller: 'UiCtrl',
            action: 'llms',
            middlewares: [],
        },
    ]
    const targets = enumerateStaticTargets(routes, [ref(UiCtrl)], {
        distRoot: DIST,
    })
    assertEquals(targets.map((t) => t.url).sort(), ['/ui', '/ui/llms.txt'])
    // The file-like route lands at a literal file.
    const llms = targets.find((t) => t.url === '/ui/llms.txt')!
    assertEquals(llms.outputPath, join(DIST, 'ui', 'llms.txt'))
})

Deno.test('enumerate - a @Static non-GET route throws (FR-010)', () => {
    @Controller('/x')
    class XCtrl {
        @Post('/')
        @Static()
        create() {}
    }
    new XCtrl()
    const routes: RouteInfo[] = [
        {
            method: 'POST',
            path: '/x',
            controller: 'XCtrl',
            action: 'create',
            middlewares: [],
        },
    ]
    assertThrows(
        () => enumerateStaticTargets(routes, [ref(XCtrl)], { distRoot: DIST }),
        Error,
        'GET',
    )
})

Deno.test('enumerate - a parameterized @Static route without params throws actionably (SC-007)', () => {
    @Controller('/docs')
    class DocsCtrl {
        @Get('/:slug')
        @Static()
        page() {}
    }
    new DocsCtrl()
    const routes: RouteInfo[] = [
        {
            method: 'GET',
            path: '/docs/:slug',
            controller: 'DocsCtrl',
            action: 'page',
            middlewares: [],
        },
    ]
    assertThrows(
        () =>
            enumerateStaticTargets(routes, [ref(DocsCtrl)], { distRoot: DIST }),
        Error,
        'params',
    )
})

Deno.test('enumerate - a literal params list expands into one target per entry (US4)', () => {
    @Controller('/docs')
    class DocsCtrl {
        @Get('/:slug')
        @Static({ params: [{ slug: 'intro' }, { slug: 'setup' }] })
        page() {}
    }
    new DocsCtrl()
    const routes: RouteInfo[] = [
        {
            method: 'GET',
            path: '/docs/:slug',
            controller: 'DocsCtrl',
            action: 'page',
            middlewares: [],
        },
    ]
    const targets = enumerateStaticTargets(routes, [ref(DocsCtrl)], {
        distRoot: DIST,
    })
    assertEquals(targets.map((t) => t.url).sort(), [
        '/docs/intro',
        '/docs/setup',
    ])
    assertEquals(
        targets.find((t) => t.url === '/docs/intro')!.outputPath,
        join(DIST, 'docs', 'intro', 'index.html'),
    )
})

Deno.test('enumerate - a traversal param value is rejected by outputPathFor (ties to S1)', () => {
    @Controller('/docs')
    class DocsCtrl {
        @Get('/:slug')
        @Static({ params: [{ slug: '../secret' }] })
        page() {}
    }
    new DocsCtrl()
    const routes: RouteInfo[] = [
        {
            method: 'GET',
            path: '/docs/:slug',
            controller: 'DocsCtrl',
            action: 'page',
            middlewares: [],
        },
    ]
    assertThrows(
        () =>
            enumerateStaticTargets(routes, [ref(DocsCtrl)], { distRoot: DIST }),
        Error,
    )
})

Deno.test('loadControllers - is fatal on an import failure (FR-012), naming the file', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.writeTextFile(
            join(dir, 'broken_controller.ts'),
            'throw new Error("boom on import")\n',
        )
        await assertRejects(
            () => loadControllers(dir),
            Error,
            'broken_controller.ts',
        )
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('loadControllers - collects @Controller exports from a dir', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.writeTextFile(
            join(dir, 'good_controller.ts'),
            `import { Controller, Get } from '@lockness/contract'\n` +
                `@Controller('/good')\nexport class GoodController { @Get('/') index() {} }\n`,
        )
        const controllers = await loadControllers(dir)
        assert(controllers.some((c) => c.name === 'GoodController'))
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
